# Pressly v0 Website — Historical Scope

> **Status: historical.** This document records the website-only v0 scope that
> predated the current API, Worker, Processor, and LPMS. It is not the current
> repository requirements document. Start with [the documentation map](./README.md),
> [architecture](./architecture.md), and active Stateworks work for current
> behavior and delivery status.

## 1. Overview

Pressly is a laundry and dry cleaning delivery service focused on the North Jersey area. It is powered primarily by software vendor Cents (site: trycents.com), but needs completeness towards business feature requirements. These requirements include a very optimized public website for SEO + marketing, production optimization with algorithms like bin packing (with data gotten from webhooks of Cents), creating a personal CRM for users to get notifications about their account, and other features.

In this v0, we will create the website only. The 'backend' will be a iframe (or similar; whatever is best) of the Cents website, which will help users create and manage their account, create an order, etc.

In our previous attempt of making pressly, we attempted to create the whole end to end workflow, but failed due to me not being skilled enough as a developer to finish it. So, we're going with a hybrid of vendor plus other tools we need that we'll build here.

## 2. Problems

The current trypressly.com website is built in squarespace. The problem right now is that it's too clunky as a user experience and interface, and also is not the best for SEO.

Nextjs helps us solve those two problems by letting us use our design and create optimized SSR/SSG pages.

## 3. Goals

Goals:

- Create the Nextjs web frontend similar to the website of pressly-deprecated.
  - The website should be optimized for SEO. This includes optimized text/keywords, fast rendering, and extensive metadata
  - The website should let the user explore as quickly as possible to create a pickup.
- Implement the Cents interface (app.trycents.com/order/business/OGgz) in the website to let the users create and manage their account, create orders, and manage their preferences.
- There may be two places where we do need to connect our API: the commercial page for the form and the service and pricing pages. Although, we should simply hardcode constants for now which all these pages use, then we'll implement a smarter approach.

Non-goals:

- We will most likely not implement any API endpoints.
- We will not create the other mentioned features such as better CRM, wash & fold production engine, etc.

## 4. Target Users

Anyone can use our service since everyone has clothes to wear and clean. Wash and fold is our primary service (by a mile) and dry cleaning our secondary.

Most of our customers want this service to save time. Thus, most of our customers are busy professionals and mothers/parents, even though conventional wisdom would tell us it's the elderly or injured which are tertiary. The most convenient thing is to create an easy to naviagate website right now and create the core features to reduce or eliminate customer anxieties: pricing, exact time for pickup and delivery, and miscommunications; and increase trust and visibility.

## 5. Core Features

- Home page
- Services & Pricing page
- Commercial page
- Locations page (/new-jersey, /new-jersey/{county}, new-jersey/{county}/{city-and-service})
- Privacy Policy page
- Terms of Service page

## 6. User Stories

Sussy has 3 children and has been trying to juggle a job and/or take the kids to their school, extracurriculars, etc., and on top of that worry about groceries, and so on. She needs a way to delegate some chores, which means spending at most 5-10 minutes planning (getting laundry in bag + placing an order). She places an order at Pressly's optimized website which loads fast and has all the right information. She can quickly place a pickup and get all the visibility through Pressly's communication she needs to reduce her anxiety (the latter is a later implementation).

Joe is a mid-level investment banker who work 60-80 hours a week. All he thinks is about work because he can already sense the glory of becoming a senior. He looks around his house as if the chores were a task for the inferior, thus he goes and outsources all his chores like a true focused masochist. He creates a Pressly order for his wash and fold and dry cleaning every Saturday (because unfocused Fridays are for pussies), and gets all his clothes on Sunday to get ready for the new 100 hour work week he's been hoping to acquire. The process is so simple that leaving the laundry outside feels routine, Pressly makes minimal hiccups and when they do, they communicate it promptly.

## 7. Success Metrics

- Users can traverse the website in less than 2 minutes before clicking 'Schedule a Pickup'.
- Average page load speed is 800ms-1250ms
- Content is quickly and highly ranked by search engines.
