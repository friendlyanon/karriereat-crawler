// ==UserScript==
// @name        karriere.at crawler
// @namespace   friendlyanon
// @match       https://www.karriere.at/*
// @version     1
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @run-at      document-start
// ==/UserScript==

"use strict";

GM_addStyle(`
.m-jobsListItem__titleLink { background-color: rgba(255, 255, 255, 0.5); }
.m-jobsListItem__titleLink:visited, .crawl_visited { background-color: rgba(255, 0, 0, 0.5); }
.day-separator { border-top: 30px red solid ! important; }
`);

class MenuItem {
  constructor(label, prompt, key) {
    this.key = key;
    this.prompt = prompt;
    this.value = GM_getValue(key, "");
    this.splitRegex = /,\s*/g;
    GM_registerMenuCommand(label, this.handle.bind(this));
  }

  set(value) {
    GM_setValue(this.key, this.value = value);
  }

  get() {
    return this.value.split(this.splitRegex);
  }

  handle() {
    const value = prompt(this.prompt, this.value);
    if (value != null) {
      this.set(value);
    }
  }
}

const jobs = new MenuItem("Change jobs to search", "Jobs list separated by commas", "jobs");
const regions = new MenuItem("Change region to search jobs in", "Region", "region");

class Search {
  constructor() {
    this.promise = null;
    GM_registerMenuCommand("Search for jobs", () => {
      if (this.promise != null) {
        return;
      }

      this.promise = this.handle().catch((error) => {
        console.error(error);
        alert("Error, check the console");
      }).finally(() => {
        this.promise = null;
      });
    });
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
        const first = card.firstElementChild;
        const { id } = first.dataset;
        if (seenIds.has(id) || first.classList.contains("m-jobsListItem--inactive")) {
          continue;
        } else {
          seenIds.add(id);
        }

        const img = card.querySelector(".m-jobsListItem__logo");
        if (img != null) {
          img.src = img.dataset.latesrc;
        }

        const [day, month, year] = card
          .querySelector(".m-jobsListItem__date")
          .textContent.slice(3).split(".");
        const date = `${year}-${month}-${day}`;

        yield [new Date(date).getTime(), [date, card]];
      }
    }
  }

  static sortByDate(a, b) {
    return b[0] - a[0];
  }

  static *filterPage(page) {
    for (const card of page) {
      if (card.classList.length === 1) {
        yield card;
      }
    }
  }

  static async *crawl(region, job) {
    const base = `${window.location.origin}/jobs/${job}/${region}`;
    const parser = new DOMParser();

    for (let i = 1, limit = 1; ; ++i) {
      const url = i > 1 ? `${base}?page=${i}` : base;

      console.log("Fetching %s in %s, page %d", job, region, i);
      const response = await fetch(url, { credentials: "include" });
      const doc = parser.parseFromString(await response.text(), "text/html");

      if (i === 1) {
        const [meta] = doc.getElementsByClassName("m-pagination__meta");
        if (meta != null) {
          const { 2: max } = meta.textContent.trim().split(" ");
          limit = parseInt(max, 10);
        }
      }

      yield [...Search.filterPage(doc.getElementsByClassName("m-jobsList__item"))];

      if (!(i < limit)) {
        break;
      }
    }
  }

  async handle() {
    Search.reset();

    const results = [];
    const jobList = jobs.get();
    for (const region of regions.get()) {
      for (const job of jobList) {
        for await (const cards of Search.crawl(region, job)) {
          results.push(cards);
        }
      }
    }

    const relevantCards = [...Search.process(results)];
    const target = document.querySelector("ol.m-jobsList");
    let previousDate = null;
    for (const [, [date, card]] of relevantCards.sort(Search.sortByDate)) {
      target.appendChild(card);

      if (previousDate !== date) {
        if (previousDate != null) {
          card.classList.add("day-separator");
        }

        previousDate = date;
      }
    }
  }
}

new Search();
