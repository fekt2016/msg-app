# How Stories Work — a Plain-English Guide

A simple walkthrough of the Stories feature in Eaz Community: what it does, what
a user sees, and what happens behind the scenes. No deep tech knowledge needed.

---

## What a Story is

A **Story** is a photo or short video that a user shares and that **disappears
after 24 hours**. Think Instagram / WhatsApp status, but shown in a
**full-screen, scrollable feed** like TikTok.

- Everyone who's signed in can see everyone else's stories (it's a shared,
  community-wide feed — there are no "followers" yet).
- After 24 hours a story is gone automatically. Nobody has to delete it.

---

## What the user sees (the Home screen)

When you open the app, **Home is the Stories feed**:

- One story fills the **whole screen**. Videos **play automatically** (muted, so
  they never blast sound unexpectedly).
- **Swipe up** to go to the next story, **swipe down** for the previous — just
  like TikTok. The order is **shuffled**, so it feels fresh each time.
- Down the **right side** there are quick actions:
  - ❤️ **Like** — tap to like (it turns red) and see the like count.
  - ✈️ **Share** — opens your phone's share sheet.
  - 🔊 **Mute / unmute** — turn video sound on or off for the whole feed.
- At the **bottom-left**: who posted it, how long ago, and the caption.
- At the **top**: **＋** to add your own story, and **◆** to jump to Channels.
- The **bottom tab bar** (Home / Communities / Chats / Profile) stays visible the
  whole time.

If there are no stories yet, you get a friendly "No stories yet — be the first"
screen with an **Add your story** button.

---

## Posting a story

1. Tap **＋** and pick a **photo or video** from your phone.
2. Optionally type a **caption** (up to 500 characters).
3. Publish.

Behind the scenes the app:

- **Checks the file is really an image or video** by inspecting the file's actual
  contents (not just trusting its name/label) — so someone can't sneak in a
  disguised file.
- **Uploads the media to Cloudinary** (the cloud media service) and stores only a
  link to it.
- Sets the story to **expire in 24 hours**.

> If Cloudinary isn't set up (e.g. a fresh dev machine), posting still works but
> uses a **placeholder** video/photo instead of your real file — handy for
> testing without extra setup.

---

## Who has seen it, and "seen" status

- As you scroll and a story lands on screen, it's quietly **marked as seen** for
  you. You're only ever counted **once** per story, no matter how many times you
  look.
- The **author** (and only the author) can see **how many views** their story got
  and **who** viewed it. Other people never see another person's view count —
  that stays private.

---

## Likes

- Anyone can **like** a story; tap again to **unlike**.
- The **like count is public** — everyone sees it — and it **sticks around**: if
  you like something and reopen the app later, it's still liked.
- The heart and the number update **instantly** when you tap, then confirm with
  the server in the background.

---

## When stories disappear

- Every story has a **24-hour timer**. When it's up, the database removes the
  story **and** its views and likes automatically — no leftovers.
- The **author can also delete their own story early**; that removes it (and its
  views/likes) right away. Only the author can do this.

---

## The "demo" stories

For testing and demos there's a small script that drops in **10 sample video
stories** (from a few made-up demo accounts) so the feed isn't empty. They're
set to last longer than 24 hours so they stick around while you try things, and
re-running the script just refreshes them (no duplicates).

---

## Behind the scenes (the short version)

- **The feed is grouped by author** but shown as one shuffled, full-screen
  stream. The shuffle order stays **stable** while you interact — liking a story
  won't suddenly reorder everything.
- **Stories are "public content"** by design (like Channels/Communities), so the
  server can safely show them to any signed-in user. Private per-user visibility
  (hide from certain people) is a **planned future setting**, not built yet.
- **Everything is rate-limited** so nobody can spam-post or spam-like, and all
  the private bits (view counts, viewer lists) are locked to the author only.
- It was **security-reviewed** before shipping — no blocking issues.

---

## Things to know / current limits

- **No comments** on stories (only likes).
- **No followers/friends model** — stories are visible to the whole community.
- **Live updates** are partial: the person who acts (likes/views) sees changes
  instantly; other people watching the same story see the latest numbers when
  they refresh, not always the exact second it happens.
- **Real media uploads need Cloudinary configured**; otherwise you get placeholder
  media in development.

---

_This document describes behavior as built. If the feature changes, update this
file to match._
