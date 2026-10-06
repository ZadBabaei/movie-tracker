// Content for the public, crawlable pages. Each page is rendered to a static
// HTML file at build time (see ./render.ts and ./vitePlugin.ts), so search
// engines and link previews see the full text without running JavaScript.
//
// Keep every claim here true to what the app actually does.

import { CONTACT_EMAIL, SITE_NAME, SITE_ORIGIN, absoluteUrl } from "./siteConfig";

export interface SitePage {
  path: string;
  /** Output file name inside dist/. */
  file: string;
  title: string;
  description: string;
  /** Indexable pages get a canonical URL and are listed in sitemap.xml. */
  indexable: boolean;
  body: string;
  jsonLd?: Record<string, unknown>;
  /** Extra markup for <head>, e.g. an inline script. */
  head?: string;
}

const contactSentence = (subject: string) =>
  CONTACT_EMAIL
    ? `For ${subject}, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the address on your account.`
    : `For ${subject}, contact the Movie Tracker team from the email address on your account.`;

const signupCta = (heading: string, text: string) => `
<section class="cta">
  <h2>${heading}</h2>
  <p>${text}</p>
  <div class="actions">
    <a class="btn btn-primary" href="/signup">Create an account</a>
    <a class="btn btn-ghost" href="/login">Sign in</a>
  </div>
</section>`;

// Signed-in visitors who open the home page go straight to the app, as they did
// when "/" was the sign-in screen. Crawlers never hold a session token.
const redirectSignedInScript = `<script>
try {
  var t = localStorage.getItem("token");
  if (t) {
    var p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p && p.exp * 1000 > Date.now()) location.replace("/home");
  }
} catch (e) {}
</script>`;

const home: SitePage = {
  path: "/",
  file: "index.html",
  title: "Movie Tracker — Track Movies, TV Episodes & Movie Nights",
  description:
    "Keep a personal movie diary, track TV series episode by episode, build a watchlist, and plan movie nights with friends using group polls and chat.",
  indexable: true,
  head: redirectSignedInScript,
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: SITE_NAME,
        alternateName: "movietrk",
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_ORIGIN}/#app`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        description:
          "A web app for logging the movies and TV episodes you watch, keeping a watchlist, and planning movie nights with friends through group polls, ratings and chat.",
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript and a modern web browser.",
        featureList: [
          "Movie watch history with watch date, location, notes and ratings",
          "TV series episode tracking",
          "Personal movie watchlist",
          "Group polls for choosing what to watch",
          "Group chat and comments",
          "Stremio watch history import",
        ],
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      },
    ],
  },
  body: `
<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Movie &amp; TV tracker</p>
    <h1>Your movie diary, TV tracker and movie-night planner</h1>
    <p class="lead">Movie Tracker keeps a dated record of every film and episode you watch, holds the list of what you want to see next, and gives your friends one place to decide what to watch together.</p>
    <div class="actions">
      <a class="btn btn-primary" href="/signup">Create an account</a>
      <a class="btn btn-ghost" href="/features">See all features</a>
    </div>
    <p class="fine">Already have an account? <a href="/login">Sign in</a>.</p>
  </div>
  <div class="diary" aria-hidden="true">
    <div class="diary-head"><span>This month</span><span>4 entries</span></div>
    <div class="diary-row"><span class="d-date">Fri<b>03</b></span><span class="d-main"><b>Movie</b><i>Watched at home · notes added</i></span><span class="d-score">8/10</span></div>
    <div class="diary-row"><span class="d-date">Sat<b>04</b></span><span class="d-main"><b>Series · S2 E4–E6</b><i>One viewing session, three episodes</i></span><span class="d-score">TV</span></div>
    <div class="diary-row"><span class="d-date">Sun<b>05</b></span><span class="d-main"><b>Group pick</b><i>Won the poll · rated by 4 friends</i></span><span class="d-score">7.5</span></div>
    <div class="diary-row is-next"><span class="d-date">Next</span><span class="d-main"><b>Watchlist</b><i>12 titles waiting</i></span><span class="d-score">→</span></div>
  </div>
</section>

<section class="section">
  <h2>What you can do with Movie Tracker</h2>
  <div class="cards">
    <article class="card">
      <h3>Log the movies you watch</h3>
      <p>Mark a film as watched and keep the date, where you saw it, a few notes and your rating out of 10. Over time it becomes a personal movie diary you can scroll back through.</p>
      <a class="more" href="/movie-tracker">How movie tracking works</a>
    </article>
    <article class="card">
      <h3>Track TV series episode by episode</h3>
      <p>Pick a season, tick off the episodes you have seen, and Movie Tracker groups a night of viewing into a single session on your timeline.</p>
      <a class="more" href="/tv-series-tracker">About the TV series tracker</a>
    </article>
    <article class="card">
      <h3>Decide movie night together</h3>
      <p>Create a group, invite friends with a link, and let everyone rank the options in a poll. Afterwards each person rates what you watched.</p>
      <a class="more" href="/features#groups">Group features</a>
    </article>
  </div>
</section>

<section class="section split">
  <div>
    <h2>A watch history you can actually look back on</h2>
    <p>Movies and episodes sit on one timeline, organised month by month. Jump between months to answer the questions that usually go unanswered: when did we last watch that, what did I see over the holidays, which series did I stop halfway through?</p>
    <p><a class="more" href="/watch-history">Explore the watch history</a></p>
  </div>
  <div>
    <h2>Bring your Stremio history with you</h2>
    <p>If you watch through Stremio, you can connect your account and import completed movies and TV episodes into your history instead of re-entering them by hand. Your Stremio password is never stored.</p>
  </div>
</section>

<section class="section">
  <h2>How it works</h2>
  <ol class="steps">
    <li><b>Find a title.</b> Search movies and TV series using data from The Movie Database (TMDB), with posters, cast and release details.</li>
    <li><b>Save it or log it.</b> Add it to your watchlist for later, or mark it watched straight away.</li>
    <li><b>Add the details that matter to you.</b> The date, where you watched, notes and a rating.</li>
    <li><b>Share it when you want to.</b> Keep it personal, or plan the next viewing with a group.</li>
  </ol>
</section>

<section class="section faq">
  <h2>Common questions</h2>
  <h3>Do I need to install anything?</h3>
  <p>No. Movie Tracker runs in your web browser on desktop and on mobile.</p>
  <h3>Is my watch history public?</h3>
  <p>No. Entries you log for yourself stay in your account. Entries you log for a group are shared with that group's members.</p>
  <h3>Does it detect what I stream automatically?</h3>
  <p>Only through the optional Stremio import. Everything else you add yourself, which keeps the history accurate and under your control.</p>
  <h3>Where does the movie information come from?</h3>
  <p>Titles, posters and artwork come from TMDB. Read more on the <a href="/about">about page</a>.</p>
</section>
${signupCta("Start your movie diary", "Create an account to log what you watch, track your series and plan the next movie night.")}
`,
};

const features: SitePage = {
  path: "/features",
  file: "features.html",
  title: "Features — Watch History, TV Tracking, Watchlists & Group Polls",
  description:
    "Everything Movie Tracker does: a dated watch history, episode-level TV tracking, a personal watchlist, group polls, ratings, comments, chat and Stremio import.",
  indexable: true,
  body: `
<section class="page-head">
  <p class="eyebrow">Features</p>
  <h1>Everything in Movie Tracker</h1>
  <p class="lead">Movie Tracker is built around two habits: remembering what you have watched, and agreeing with other people on what to watch next. Here is what each part of the app does.</p>
  <nav class="toc" aria-label="On this page">
    <a href="#history">Watch history</a>
    <a href="#tv">TV series</a>
    <a href="#watchlist">Watchlist</a>
    <a href="#groups">Groups &amp; movie nights</a>
    <a href="#discover">Discovery</a>
    <a href="#stremio">Stremio import</a>
  </nav>
</section>

<section class="section feature" id="history">
  <h2>Personal watch history</h2>
  <p>Every movie you mark as watched becomes an entry in your history. Each entry can hold:</p>
  <ul class="ticks">
    <li>the date you watched it</li>
    <li>where you watched it, such as at home, at a cinema or at a friend's place</li>
    <li>your own notes</li>
    <li>a rating from 1 to 10</li>
  </ul>
  <p>The history is arranged month by month and skips months with nothing in them, so you can move through a year of viewing quickly. <a href="/watch-history">More about the watch history</a>.</p>
</section>

<section class="section feature" id="tv">
  <h2>TV series and episode tracking</h2>
  <p>Search for a series, choose a season and mark the episodes you have seen. Episodes watched on the same day are grouped into one viewing session on your timeline, and each series has its own page showing your progress alongside the cast. <a href="/tv-series-tracker">More about the TV series tracker</a>.</p>
</section>

<section class="section feature" id="watchlist">
  <h2>Movie watchlist</h2>
  <p>Keep a list of films you want to see, with full details from TMDB. Heart your favourites to keep them at the top, browse trending suggestions when the list runs dry, and move a title into your history the moment you watch it. From the watchlist you can also start a group poll with the movies you are considering.</p>
</section>

<section class="section feature" id="groups">
  <h2>Groups and movie nights</h2>
  <p>Groups are for the people you actually watch with: housemates, a film club, family, a long-distance friend group.</p>
  <ul class="ticks">
    <li><b>Invite links.</b> Share a link and friends join the group after signing in.</li>
    <li><b>Polls.</b> Members rank the candidate movies in order of preference. The lowest combined ranking wins, and ties go to a runoff, so nobody's first choice is ignored.</li>
    <li><b>Group watch history.</b> Movies the group watched together sit on a shared timeline, and every member can add their own rating.</li>
    <li><b>Comments.</b> Discuss a movie in threaded comments on its detail page.</li>
    <li><b>Group chat.</b> Real-time chat with your group, alongside its poll history.</li>
  </ul>
</section>

<section class="section feature" id="discover">
  <h2>Discovery</h2>
  <p>The Coming Soon page lists upcoming premieres, and the built-in movie assistant answers questions about films and series: what to watch if you liked something, who was in it, or where a title fits in a franchise.</p>
</section>

<section class="section feature" id="stremio">
  <h2>Stremio import</h2>
  <p>Connect a Stremio account to import completed movies and TV episodes into your watch history. Movies are matched to TMDB titles. Stremio does not record when an episode was watched, so imported episodes use the sync date as their watch date. Your Stremio password is used once to sign in and is never stored; Movie Tracker keeps an encrypted session so you can sync again without reconnecting.</p>
</section>
${signupCta("Try it with your own history", "Start with one movie you watched this week, then build from there.")}
`,
};

const movieTracker: SitePage = {
  path: "/movie-tracker",
  file: "movie-tracker.html",
  title: "Movie Tracker — Track Movies You've Watched in a Movie Diary",
  description:
    "Track the movies you watch with the date, place, notes and your rating, and turn your viewing into a personal movie diary you can browse month by month.",
  indexable: true,
  body: `
<section class="page-head">
  <p class="eyebrow">Movie tracking</p>
  <h1>Track the movies you watch, and remember them</h1>
  <p class="lead">Most people can name their favourite films but not what they watched last month. Movie Tracker gives every film you see a dated entry, so your viewing becomes a record you can return to.</p>
</section>

<section class="section">
  <h2>What goes into a movie entry</h2>
  <p>When you mark a movie as watched, it is added to your history with its poster and details from TMDB. You can then add as much or as little as you like:</p>
  <dl class="defs">
    <dt>Date watched</dt><dd>Defaults to today, and can be changed if you are catching up on older viewing.</dd>
    <dt>Where you watched</dt><dd>A cinema, a flight, your sofa. Useful when the setting is part of the memory.</dd>
    <dt>Notes</dt><dd>A line about what stood out, who you watched with, or whether it held up on a rewatch.</dd>
    <dt>Rating</dt><dd>A score from 1 to 10 that stays private to your personal history.</dd>
  </dl>
</section>

<section class="section split">
  <div>
    <h2>From watchlist to diary in one step</h2>
    <p>Films you want to see live on your watchlist. When you finally watch one, mark it watched and it moves into your history with the details already filled in. The watchlist stays short and the diary keeps growing.</p>
  </div>
  <div>
    <h2>A private record, not a review site</h2>
    <p>Movie Tracker is not a public ratings platform. Your personal entries are for you, so you can rate honestly and keep notes you would never post publicly. When you do want to compare opinions, rate a movie inside a group instead.</p>
  </div>
</section>

<section class="section">
  <h2>Questions a movie diary can answer</h2>
  <ul class="ticks">
    <li>When did I last watch this, and what did I think of it then?</li>
    <li>How many films did I see in a given month?</li>
    <li>Which of the movies I watched this year did I rate highest?</li>
    <li>What did we watch at that movie night with friends?</li>
  </ul>
  <p>Your history is arranged by month, so these answers are a few taps away. <a href="/watch-history">See how the watch history is organised</a>.</p>
</section>

<section class="section">
  <h2>Already logging somewhere else?</h2>
  <p>If you watch through Stremio, you can import completed movies instead of entering them one by one. Other titles take a few seconds each to add: search, mark watched, done. Watching series too? The <a href="/tv-series-tracker">TV series tracker</a> works the same way for episodes.</p>
</section>
${signupCta("Start your movie diary", "Log the last film you watched and see your history take shape.")}
`,
};

const tvTracker: SitePage = {
  path: "/tv-series-tracker",
  file: "tv-series-tracker.html",
  title: "TV Series Tracker — Track the Episodes You've Watched",
  description:
    "Track TV series episode by episode. Mark episodes watched, see your progress per season, and keep binge sessions together on one timeline with your movies.",
  indexable: true,
  body: `
<section class="page-head">
  <p class="eyebrow">TV series tracker</p>
  <h1>Keep track of every series, one episode at a time</h1>
  <p class="lead">Long-running shows are easy to lose your place in. Movie Tracker's episode tracker records exactly which episodes you have watched and when, next to the movies in your history.</p>
</section>

<section class="section">
  <h2>How episode tracking works</h2>
  <ol class="steps">
    <li><b>Find the series.</b> Search by name; series details, seasons and episode lists come from TMDB.</li>
    <li><b>Pick the episodes.</b> Choose a season and select the episodes you have seen, one or many at a time.</li>
    <li><b>Save them to your history.</b> Each episode gets its own entry with the date you watched it.</li>
  </ol>
</section>

<section class="section split">
  <div>
    <h2>Binge sessions stay together</h2>
    <p>Watching four episodes in a night is one experience, not four. Episodes of a series watched on the same day are shown as a single viewing session on your timeline, so a weekend binge does not bury the rest of your history.</p>
  </div>
  <div>
    <h2>A page for every series</h2>
    <p>Each series you track has its own history page showing the episodes you have logged and the cast, so you can see where you left off before starting the next episode.</p>
  </div>
</section>

<section class="section">
  <h2>Movies and TV in one place</h2>
  <p>Many trackers handle either films or shows. Movie Tracker keeps both on the same <a href="/watch-history">month-by-month watch history</a>, which is closer to how people actually watch: a film on Friday, three episodes on Saturday.</p>
</section>

<section class="section">
  <h2>Importing episodes from Stremio</h2>
  <p>If you connect Stremio, completed episodes can be imported automatically. Stremio does not share the exact time you watched each episode, so imported episodes use the date of the sync as their watch date. Episodes you add yourself keep the date you choose.</p>
</section>
${signupCta("Track your next episode", "Add the series you are watching now and pick up exactly where you left off.")}
`,
};

const watchHistory: SitePage = {
  path: "/watch-history",
  file: "watch-history.html",
  title: "Movie Watch History — See What You Watched, Month by Month",
  description:
    "A movie and TV watch history organised by month: what you watched, when and where, with notes and ratings, plus a shared timeline for group movie nights.",
  indexable: true,
  body: `
<section class="page-head">
  <p class="eyebrow">Watch history</p>
  <h1>Your watch history, organised by month</h1>
  <p class="lead">A list of titles is not a history. Movie Tracker records when you watched each movie and episode, then lays them out month by month so you can look back at a season, a year or a single night.</p>
</section>

<section class="section">
  <h2>What the history shows</h2>
  <ul class="ticks">
    <li><b>Movies and TV episodes together</b>, in the order you watched them.</li>
    <li><b>Month-by-month navigation</b> that skips empty months, so long gaps do not slow you down.</li>
    <li><b>Episode sessions</b>: episodes of one series watched on the same day appear as one entry.</li>
    <li><b>Your details</b> on each entry: date, place, notes and rating.</li>
  </ul>
</section>

<section class="section split">
  <div>
    <h2>Personal history</h2>
    <p>Your own entries make up a private movie diary. Nobody else sees your ratings or notes unless you log the movie for a group.</p>
  </div>
  <div>
    <h2>Group history</h2>
    <p>Movies a group watches together go on the group's shared timeline. Each member adds their own rating, which makes it easy to see who loved the pick and who is still recovering.</p>
  </div>
</section>

<section class="section">
  <h2>How entries get there</h2>
  <p>You add titles yourself, either by marking something on your watchlist as watched or by searching and logging it directly. If you use Stremio, completed movies and episodes can be imported. Movie Tracker does not read your other streaming accounts, so the history only contains what you choose to record.</p>
  <p>Read more about <a href="/movie-tracker">tracking movies</a> and <a href="/tv-series-tracker">tracking TV episodes</a>.</p>
</section>
${signupCta("Start your watch history", "Your first entry takes a few seconds. The history builds itself from there.")}
`,
};

const about: SitePage = {
  path: "/about",
  file: "about.html",
  title: "About Movie Tracker",
  description:
    "What Movie Tracker is, how it is built and where its data comes from: a web app for keeping a movie and TV watch history and planning movie nights.",
  indexable: true,
  body: `
<section class="page-head">
  <p class="eyebrow">About</p>
  <h1>About Movie Tracker</h1>
  <p class="lead">Movie Tracker started with a familiar problem: a group of friends, a free evening, and forty minutes spent deciding what to watch. It grew into a place to plan those nights and to remember everything watched along the way.</p>
</section>

<section class="section">
  <h2>What Movie Tracker is for</h2>
  <p>The app does two jobs. For you on your own, it is a <a href="/movie-tracker">movie tracker</a> and <a href="/tv-series-tracker">TV episode tracker</a> that builds a dated <a href="/watch-history">watch history</a>. For the people you watch with, it is a shared space with a watchlist, ranked polls, ratings, comments and chat, so choosing a film is quick and the conversation afterwards has somewhere to live.</p>
  <p>See the full list on the <a href="/features">features page</a>.</p>
</section>

<section class="section">
  <h2>How it is built</h2>
  <p>Movie Tracker is a web application built with React on the front end and Node.js with MongoDB on the back end. Group chat and live updates use real-time connections, so votes and messages appear without refreshing the page. It works in any modern browser on desktop and mobile.</p>
</section>

<section class="section">
  <h2>Where the movie data comes from</h2>
  <p>Movie and TV information, posters and artwork are provided by <a href="https://www.themoviedb.org/" rel="noopener">The Movie Database (TMDB)</a> and <a href="https://www.watchmode.com/" rel="noopener">Watchmode</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
</section>

<section class="section">
  <h2>Privacy and terms</h2>
  <p>Read the <a href="/privacy">privacy policy</a> to see what data Movie Tracker stores and why, and the <a href="/terms">terms of service</a> for the rules of using the app. ${contactSentence("questions about your account")}</p>
</section>
${signupCta("Plan your next movie night", "Create an account, start a group and send the invite link.")}
`,
};

const privacy: SitePage = {
  path: "/privacy",
  file: "privacy.html",
  title: "Privacy Policy | Movie Tracker",
  description:
    "How Movie Tracker collects, uses and stores your data, which services process it, and the choices you have over your account and watch history.",
  indexable: true,
  body: `
<article class="legal">
  <h1>Privacy Policy</h1>
  <p class="updated">Last updated: October 5, 2026</p>
  <p>This policy explains what information Movie Tracker (movietrk.com) collects, how it is used, and which services help run the app. Movie Tracker does not sell your personal information.</p>

  <h2>1. Information you give us</h2>
  <ul>
    <li><b>Account details:</b> your name, email address and password. Passwords are stored as a one-way hash, never in plain text. If you sign in with Google, we receive your name, email address and profile picture from Google.</li>
    <li><b>Profile picture:</b> an image you upload, or a generated avatar.</li>
    <li><b>Watch activity:</b> your watchlist, favourites, watch history entries and the details you add to them (dates, where you watched, notes and ratings), and the TV episodes you mark as watched.</li>
    <li><b>Group activity:</b> groups you create or join, poll votes, ratings, comments and chat messages.</li>
    <li><b>Movie assistant:</b> the questions you type into the built-in assistant.</li>
    <li><b>Stremio connection (optional):</b> if you connect Stremio, your Stremio password is used once to sign in and is not stored. We keep an encrypted Stremio session and the watch status needed to import your completed movies and episodes.</li>
  </ul>

  <h2>2. Information collected automatically</h2>
  <ul>
    <li><b>Usage analytics:</b> which pages and features are used, the type of device (desktop, mobile or tablet), and an approximate location (country, region or city) derived by our hosting provider from your connection. We use this to understand which features are useful and to fix problems.</li>
    <li><b>Product analytics:</b> we use PostHog to record product events. Automatic click capture and session recording are turned off.</li>
    <li><b>Browser storage:</b> your sign-in session is kept in your browser's local storage. Analytics tools may also store an identifier in your browser.</li>
  </ul>

  <h2>3. How we use information</h2>
  <p>We use your information to provide the service: to sign you in, show your history and watchlist, run your groups, polls and chat, send password reset emails, answer assistant questions, and improve the app. We do not use your watch history for advertising.</p>

  <h2>4. Who can see your information</h2>
  <p>Personal watch history entries, notes and ratings are visible only to you. Information you add to a group, such as group history, ratings, poll votes, comments and chat messages, is visible to that group's members. Your name and profile picture are visible to people who share a group with you.</p>

  <h2>5. Services that process data for us</h2>
  <p>Movie Tracker relies on the following providers, each of which processes data only as needed to deliver its part of the service:</p>
  <ul>
    <li><b>Vercel</b> and <b>Railway</b> host the website and server.</li>
    <li><b>MongoDB Atlas</b> stores the app database.</li>
    <li><b>Stream</b> powers group chat and stores chat messages.</li>
    <li><b>Cloudinary</b> stores uploaded profile pictures.</li>
    <li><b>OpenAI</b> generates movie assistant answers from the questions you send.</li>
    <li><b>Resend</b> delivers password reset emails.</li>
    <li><b>PostHog</b> provides product analytics.</li>
    <li><b>Google</b> provides optional sign-in.</li>
    <li><b>TMDB</b> and <b>Watchmode</b> provide movie and TV information. Your browser loads posters and artwork from TMDB's image servers.</li>
  </ul>

  <h2>6. Keeping and deleting data</h2>
  <p>We keep your account data while your account exists. You can remove entries from your watchlist and history at any time inside the app. To delete your account and its data, contact us as described below and we will remove it. Messages you posted in a group may remain visible to its members until the account is deleted.</p>

  <h2>7. Security</h2>
  <p>Connections to Movie Tracker use HTTPS, passwords are hashed, and stored Stremio sessions are encrypted. No online service is perfectly secure, so please use a password you do not use elsewhere.</p>

  <h2>8. Children</h2>
  <p>Movie Tracker is not directed at children under 13, and we do not knowingly collect their information.</p>

  <h2>9. Changes to this policy</h2>
  <p>If this policy changes, we will update the date at the top of this page.</p>

  <h2>10. Contact</h2>
  <p>${contactSentence("privacy questions, data access or account deletion")}</p>

  <p class="legal-links">See also the <a href="/terms">Terms of Service</a>.</p>
</article>
`,
};

const terms: SitePage = {
  path: "/terms",
  file: "terms.html",
  title: "Terms of Service | Movie Tracker",
  description:
    "The terms for using Movie Tracker: accounts, your content, groups, acceptable use, service availability and termination.",
  indexable: true,
  body: `
<article class="legal">
  <h1>Terms of Service</h1>
  <p class="updated">Last updated: March 30, 2026</p>

  <h2>1. Acceptance of Terms</h2>
  <p>By creating an account and using Movie Tracker, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.</p>

  <h2>2. Account Registration</h2>
  <p>You must provide accurate and complete information when creating your account. You are responsible for maintaining the security of your account credentials and for all activities that occur under your account.</p>

  <h2>3. User Content</h2>
  <p>You retain ownership of content you post, including comments, ratings, and group contributions. By posting content, you grant Movie Tracker a non-exclusive license to display it within the platform. You agree not to post content that is offensive, illegal, or violates the rights of others.</p>

  <h2>4. Groups &amp; Collaboration</h2>
  <p>Group creators are responsible for managing their groups. Members must respect group rules and other members. Movie Tracker reserves the right to remove groups or content that violates these terms.</p>

  <h2>5. Privacy &amp; Data</h2>
  <p>We collect and store your name, email, profile picture, watchlist data, and group activity. This data is used solely to provide the Movie Tracker service. We do not sell your personal information to third parties. Movie data is sourced from TMDB and is subject to their terms of use. See the <a href="/privacy">Privacy Policy</a> for details.</p>

  <h2>6. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the service for any unlawful purpose</li>
    <li>Harass, abuse, or harm other users</li>
    <li>Attempt to gain unauthorized access to the service or other accounts</li>
    <li>Upload malicious content or spam</li>
    <li>Impersonate other users or entities</li>
  </ul>

  <h2>7. Service Availability</h2>
  <p>Movie Tracker is provided "as is" without warranties. We may modify, suspend, or discontinue the service at any time without prior notice. We are not liable for any interruptions or data loss.</p>

  <h2>8. Termination</h2>
  <p>We reserve the right to suspend or terminate your account if you violate these terms. You may delete your account at any time by contacting support.</p>

  <h2>9. Changes to Terms</h2>
  <p>We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the updated terms.</p>
</article>
`,
};

export const notFoundPage: SitePage = {
  path: "/404",
  file: "404.html",
  title: "Page not found | Movie Tracker",
  description: "This page does not exist on Movie Tracker.",
  indexable: false,
  body: `
<section class="page-head">
  <p class="eyebrow">404</p>
  <h1>That page does not exist</h1>
  <p class="lead">The link may be old or mistyped. Here are some places to go instead.</p>
  <div class="actions">
    <a class="btn btn-primary" href="/">Go to the home page</a>
    <a class="btn btn-ghost" href="/login">Sign in</a>
  </div>
</section>
`,
};

/** Public pages in navigation and sitemap order. */
export const sitePages: SitePage[] = [
  home,
  features,
  movieTracker,
  tvTracker,
  watchHistory,
  about,
  privacy,
  terms,
];

export const pageUrl = (page: SitePage) => absoluteUrl(page.path);
