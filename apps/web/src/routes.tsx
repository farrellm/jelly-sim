import { createBrowserRouter } from 'react-router-dom';
import { AuthGate } from './components/AuthGate.js';
import { Island } from './screens/Island.js';
import { Login } from './screens/Login.js';
import { Placeholder } from './screens/Placeholder.js';
import { Register } from './screens/Register.js';
import { Settings } from './screens/Settings.js';

/**
 * The route table from DESIGN.md §10.2.
 *
 * Every tab is routed from Phase 0 so the navigation shape — five tabs, everything one tap
 * from the island — is real and testable before any of it has contents. Screens that are
 * not built yet say which phase builds them.
 *
 * These are real history entries, so the iOS back-swipe gesture behaves (§11.1).
 */
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/',
    element: <AuthGate />,
    children: [
      { index: true, element: <Island /> },
      {
        path: 'bean',
        element: (
          <Placeholder
            title="Bean"
            phase="Phase 1"
            blurb="Needs, mood, and the care actions that resolve them."
          />
        ),
      },
      {
        path: 'farm',
        element: (
          <Placeholder
            title="Farm"
            phase="Phase 2"
            blurb="Plots, crops, gathering nodes — and a shovel."
          />
        ),
      },
      {
        path: 'build',
        element: (
          <Placeholder
            title="Build"
            phase="Phase 3"
            blurb="A bed, a house, and eventually a toilet worth announcing."
          />
        ),
      },
      {
        path: 'games',
        element: (
          <Placeholder
            title="Mini-games"
            phase="Phase 2"
            blurb="Bean Sort, Gumdrop Match, and Burger Stack — the answer to being fourteen short."
          />
        ),
      },
      {
        path: 'quests',
        element: (
          <Placeholder
            title="Quests"
            phase="Phase 5"
            blurb="Dr. Bubblegum knocks on the door with something for you to do."
          />
        ),
      },
      {
        path: 'adventure',
        element: (
          <Placeholder
            title="Adventure"
            phase="Phase 5"
            blurb="Five rooms of candy castle, and a witch at the end of them."
          />
        ),
      },
      {
        path: 'friends',
        element: (
          <Placeholder
            title="Friends"
            phase="Phase 6"
            blurb="Gifts, bonus beans, and visiting somebody else's island."
          />
        ),
      },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
