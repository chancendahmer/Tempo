# Assistant and wellness UI polish research

Research date: 2026-10-18. Scope: public first-party material for Tempo's consent-first executive-function coaching UI. This is reference research, not a usability study or a clinical recommendation.

## Reference identity and evidence limits

**Meta Muse is a real, distinct product in the current sources.** Meta's September 8, 2026 [Muse announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a personal agent available through its app, WhatsApp, and muse.ai. The announcement identifies Muse Spark as its model and links directly to the team's design story. Do not conflate the agent with its model or assume that older Meta AI app screenshots represent Muse.

The strongest assistant reference is the first-party [How We Designed Muse](https://introducing.muse.ai/) story, dated September 2026. Its public product illustrations were visually inspected in the browser: activity, goals, and approval examples. The live [muse.ai](https://muse.ai/) entry redirected to authentication during research. No account was created, no login was bypassed, and no live assistant behavior was tested. The story's hero media reported that it could not play; motion and the live composer were not observed. Product illustrations establish visible examples and design intent, not production behavior in every state.

The strongest wellness reference is MyFitnessPal's current [Your Today tab](https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Your-Today-tab) guide, updated August 20, 2026. Its Android/iOS navigation and calorie/macro examples were visually inspected. This is more current than the older dashboard-first marketing material: the guide puts everyday logging at the home of the experience. No paid feature or authenticated app session was tested. The guide's blue annotations around screenshots are explanatory callouts, not UI borders to reproduce.

W3C sources below support accessibility decisions. Cognitive design patterns are supplemental guidance; they do not establish a particular palette's effectiveness for ADHD or prove that Tempo improves symptoms. No source reviewed supports an ADHD-specific benefit from green, purple, blue, or a neutral palette. All Tempo proposals below are design judgments to validate with users.

## Five concrete recommendations

### 1. Use neutral chrome and small, labeled color accents

**Observed:** Muse's illustrated panels use light surfaces, thin neutral outlines, dark main text, and small colored category/status markers. MyFitnessPal's illustrated summaries pair white panels and dark labels with a blue primary bar and secondary teal, purple, and amber macro bars, each named and quantified.

**Tempo proposal:** Keep the page, navigation, chat background, and ordinary controls neutral. Use one strong primary action treatment. Apply secondary color to a small consistent icon, badge, or progress detail for a meaningful category. Preserve text labels and shape cues; avoid whole saturated cards for routine information. This retains warmth without making every region compete.

**Review:** Meaning survives grayscale; ordinary text reaches 4.5:1 contrast and qualifying large text 3:1. These checks follow [W3C use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) and [text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Observed competitor colors are inspiration, not measured accessible tokens.

### 2. Organize the daily view around the next useful action

**Observed:** MyFitnessPal separates a daily summary, meal groups with nearby logging controls, and a later Healthy Habits group; deeper nutrition views open from summaries. Muse's goals illustration groups compact rows under headings and exposes a count-based expansion for additional items.

**Tempo proposal:** Put the current focus and its next step first. Follow with clearly headed groups for the rest of today and supporting context. Place an action beside the item it affects. Show a short, honest preview when a group is long, with a labeled control such as “Show 4 more.” Avoid hiding urgent or consent-related information in that preview.

**Review:** A first glance identifies the page purpose, current focus, and primary action. Section relationships remain clear at narrow widths. W3C recommends logical sections, headings, whitespace, and consistent visual cues, while cautioning that excess icons can themselves add clutter: [clear page structure](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o2p03-page-structure/).

### 3. Give conversation clear thought boundaries and a stable composer

**Documented:** Muse's design team explains that bubbles preserve boundaries when messages arrive out of turn or several are sent consecutively; it describes a main ongoing conversation with optional side chats.

**Tempo proposal:** Use restrained, readable message bubbles with an unmistakable sender distinction and comfortable paragraph spacing. Keep the writing area visually anchored, with a visible label, a plain-language prompt, and a distinct send control. On an empty conversation, offer only a few relevant starters. Keep delivery, loading, and retry states close to the affected message. Preserve the user's draft during those states.

**Review:** The composer stays reachable on a small viewport, the keyboard does not cover its controls, and send/retry controls have understandable names. The composer details are Tempo proposals; they were not observed in the live Muse app. [W3C labels and instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html) supports making input purpose understandable.

### 4. Show a concise status, then disclose the full explanation

**Documented and illustrated:** Muse provides a short activity snippet that leads to a fuller log, and separate structured approval controls for consequential actions.

**Tempo proposal:** Present one useful status line and a plainly labeled “View details” control for secondary explanations or history. Keep permission requests and decisions explicit: state the proposed action and expose clear accept/reject controls. Preserve Tempo's existing deterministic consent and safety gates; visual simplification must not bury or weaken them.

**Review:** Every disclosure works with Enter and Space and exposes its expanded state. The expanded region preserves context and the button remains findable. Follow the [W3C disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/). Avoid using a decorative avatar as the only way to discover important activity or permission controls.

### 5. Use brief feedback and honor reduced motion

**Guidance:** W3C recommends avoiding unnecessary motion or letting users disable it. Its [animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) explicitly discusses operating-system reduced-motion preferences; the underlying criterion is Level AAA.

**Tempo proposal:** Use a brief, subtle transition when a control changes state or a panel opens. A starting range of roughly 120–180 ms is an implementation judgment, not a measured competitor value. Prefer stable layouts and reserve space for loading content. Avoid looping glows, floating ornaments, parallax, and celebratory motion around ordinary tasks. Under `prefers-reduced-motion: reduce`, remove nonessential movement and show the state immediately.

**Review:** Status remains understandable with all animation disabled. A new background update does not unexpectedly move controls, steal focus, or force-scroll a reader away from earlier messages. Announce meaningful async results without requiring focus movement, following [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## Handoff and validation limits

Apply these as a cohesive refinement of Tempo's existing design language. Do not copy Muse's avatar system, import wellness streaks or calorie metaphors, or expand Tempo's product scope merely because those patterns appear in the references. A current product screenshot and interaction check should determine where each proposal fits.

This research changed no application code. No lint, typecheck, automated UI checks, live model simulations, or clinical validation were run. The next implementation review should inspect mobile and desktop views, keyboard focus, text contrast, disclosure states, conversation overflow, loading/error states, and reduced motion against the actual Tempo UI.
