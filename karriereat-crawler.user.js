// ==UserScript==
// @name        karriere.at crawler
// @namespace   friendlyanon
// @match       https://www.karriere.at/*
// @version     2
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @run-at      document-start
// ==/UserScript==

"use strict";

GM_addStyle(`
.m-jobsListItem__titleLink { background-color: rgba(255, 255, 255, 0.5); }
.m-jobsListItem__titleLink:visited { background-color: rgba(255, 0, 0, 0.5); }
`);

class MenuItem {
  constructor(label, prompt, key, defaultValue) {
    this.key = key;
    this.prompt = prompt;
    this.value = GM_getValue(key, defaultValue);
    GM_registerMenuCommand(label, this.handle.bind(this));
  }

  set(value) {
    GM_setValue(this.key, this.value = value);
  }

  get() {
    return this.value;
  }

  handle() {
    const value = prompt(this.prompt, this.value);
    if (value != null) {
      this.set(value);
    }
  }
}

const jobs = new class Jobs extends MenuItem {
  constructor() {
    super("Change jobs to search", "Jobs list separated by commas", "jobs", "");
    this.splitRegex = /,\s*/g;
  }

  get() {
    return super.get().split(this.splitRegex);
  }
};

const region = new class Region extends MenuItem {
  constructor() {
    super("Change region to search jobs in", "Region", "region", "");
  }
};

class Search {
  constructor() {
    this.working = false;
    GM_registerMenuCommand("Search for jobs", this.handle.bind(this));
  }

  static reset() {
    for (const node of [...document.querySelectorAll("ol.m-jobsList > li")]) {
      node.remove();
    }

    const pagination = document.querySelector(".m-jobsSearchList__pagination");
    if (pagination) {
      pagination.remove();
    }
  }

  static *process(results) {
    const seenIds = new Set();

    for (const page of results) {
      for (const card of page) {
        const { id } = card.firstElementChild.dataset;
        if (seenIds.has(id)) {
          continue;
        } else {
          seenIds.add(id);
        }

        const img = card.querySelector(".m-jobsListItem__logo");
        img.src = img.dataset.latesrc;
        const [day, month, year] = card
          .querySelector(".m-jobsListItem__date")
          .textContent.slice(3).split(".");

        yield [new Date(`${year}-${month}-${day}`).getTime(), card];
      }
    }
  }

  static sortByDate([a], [b]) {
    return b - a;
  }

  static async *crawl(region, job) {
    const base = `${window.location.origin}/jobs/${job}/${region}`;
    const context = { resolve: null, reject: null };
    const setContext = (resolve, reject) => {
      context.resolve = resolve;
      context.reject = reject;
    };
    const options = {
      context,
      url: base,
      method: "GET",
      responseType: "document",
      onload({ context: { resolve }, response }) {
        resolve(response);
      },
      onerror({ context: { reject }, statusText }) {
        reject(statusText);
      },
      ontimeout({ context: { reject }, statusText }) {
        reject(statusText);
      },
    };

    for (let i = 1; ; ++i) {
      if (i > 1) {
        options.url = `${base}?page=${i}`;
      }

      const promise = new Promise(setContext);
      GM_xmlhttpRequest(options);
      console.log("Fetching %s, page %d", job, i);
      const doc = await promise;

      yield [...doc.querySelectorAll("li[class='m-jobsList__item']")];

      if (doc.querySelector(".m-pagination__button--next.m-pagination__button--disabled")) {
        break;
      }
    }
  }

  async handle() {
    if (this.working) {
      return;
    }
    this.working = true;
    Search.reset();

    const results = [];
    const regionToSearch = region.get();
    for (const job of jobs.get()) {
      for await (const cards of Search.crawl(regionToSearch, job)) {
        results.push(cards);
      }
    }

    const relevantCards = [...Search.process(results)];
    const target = document.querySelector("ol.m-jobsList");
    for (const [, card] of relevantCards.sort(Search.sortByDate)) {
      target.appendChild(card);
    }

    this.working = false;
  }
}

new Search();
