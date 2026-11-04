// tabs.js — the tab bar fixed to the bottom of the screen.
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
  // Person
  profile:`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>`,
};

const TABS = [
  { id: 'workouts', label: 'Workouts', href: '#/' },
  { id: 'cardio', label: 'Cardio', href: '#/cardio' },
  { id: 'profile', label: 'Profile', href: '#/profile' },
];

// HTML for the tab bar, with the given tab highlighted.
function tabBarHtml(activeId) {
  return TABS.map(tab => `
    <a class="tab ${tab.id === activeId ? 'is-active' : ''}" href="${tab.href}"
      ${tab.id === activeId ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[tab.id]}</svg>
      <span>${tab.label}</span>
    </a>`).join('');
}
