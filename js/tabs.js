// tabs.js — the tab bar fixed to the bottom of the screen, and the + button that sits in it.
//
// To add a tab (e.g. Running):
//   1. Add an entry to TABS below (an icon in TAB_ICONS too).
//   2. Add its route in currentRoute() in app.js, with tab: '<id>' so the tab lights up.
//   3. Show its view for that route in render() in app.js.

const TAB_ICONS = {
  // Dumbbell
  workouts: `<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>`,
  // Heart
  cardio: `<path d="M12 20.5s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6-8.5 11.2-8.5 11.2z"/>`,
  // Book (the exercise Log)
  log: `<path d="M5 20V5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5 2.5 2.5 0 0 0 7.5 21H19"/><path d="M9 7.5h6"/>`,
  // Person
  profile:`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>`,
};

const TABS = [
  { id: 'workouts', label: 'Workouts', href: '#/' },
  { id: 'cardio', label: 'Cardio', href: '#/cardio' },
  { id: 'log', label: 'Log', href: '#/log' },
  { id: 'profile', label: 'Profile', href: '#/profile' },
];

// The + button goes in the bar right after this tab: between Cardio and Log, so it sits in the
// middle of the five (the user's choice).
const ADD_AFTER_TAB = 'cardio';

// What the + button's menu offers, top to bottom: the two things you do now, the two you set up
// for later, then a new split. Each one's action is in app.js.
const ADD_OPTIONS = [
  { action: 'quick-start', label: 'Quick workout', hint: 'A one-off, not added to your cycle' },
  { action: 'add-cardio', label: 'Quick cardio', hint: 'Log a walk, run, ride or hike' },
  { action: 'add-planned-workout', label: 'Planned workout', hint: 'A new workout in your cycle' },
  { action: 'cardio-plan-new', label: 'Planned cardio', hint: 'On days you pick, or after every lift' },
  { action: 'add-split', label: 'New split', hint: 'Another cycle to switch to' },
];

// The + button: a green rounded square with a black plus and no label, so it doesn't look like
// another tab. Tapping it opens the menu just above the bar ('fab-menu' in app.js).
function addButtonHtml() {
  return `
    <div class="tab-add">
      <button type="button" class="fab" data-action="fab-menu" aria-expanded="false" aria-controls="fab-menu"
        aria-label="Add: a quick workout, cardio, a planned workout or a new split">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.6"
          stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>`;
}

// The menu, and after it the dark layer that covers the page while it's open (so the menu doesn't
// blend into the cards behind it; tapping the layer closes the menu, like tapping anywhere else).
function addMenuHtml() {
  return `
    <div class="fab-menu" id="fab-menu" aria-hidden="true">
      ${ADD_OPTIONS.map(option => `
        <button type="button" class="fab-option" data-action="${option.action}">
          <strong>${option.label}</strong><span>${option.hint}</span>
        </button>`).join('')}
    </div>
    <div class="fab-backdrop" aria-hidden="true"></div>`;
}

// HTML for the tab bar, with the given tab highlighted. The + button and its menu are part of it,
// so they're on every tab's main screen and the menu starts closed each time the bar is drawn.
function tabBarHtml(activeId) {
  return TABS.map(tab => `
    <a class="tab ${tab.id === activeId ? 'is-active' : ''}" href="${tab.href}"
      ${tab.id === activeId ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[tab.id]}</svg>
      <span>${tab.label}</span>
    </a>${tab.id === ADD_AFTER_TAB ? addButtonHtml() : ''}`).join('') + addMenuHtml();
}
