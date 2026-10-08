import { options } from 'preact';

// Preact's default after-paint scheduler pairs requestAnimationFrame with a timeout and later calls
// cancelAnimationFrame and clearTimeout. Test files install, fake, and remove those globals, so a
// callback scheduled in one file could fire in the next one and fail there. Scheduling on a timer
// captured at startup keeps effect flushing independent of those globals.
const scheduleTimer = setTimeout;

options.requestAnimationFrame = (callback) => {
  scheduleTimer(callback, 0);
};
