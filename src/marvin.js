const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const marvinResponses = {
  recordBanked: ["Nice catch.", "Stored.", "Got it."],
  freebieBanked: ["First one's free. You're welcome."],
  checkpointList: ["Here's what you've got."],
  explainReport: ["Let me see what they did.", "Reading the report..."],
  blockPlaced: ["That's the one."],
  blockMelted: ["Oops. That one's gone. Dispatch again."],
  questionAppears: ["The ship needs to know this."],
  correctAnswer: ["Check.", "Clearance granted."],
  wrongAnswer: ["Hmm. Try again.", "Not quite."],
  launchReady: ["You're clear for launch."],
};

export function marvinLine(text, state = "active") {
  return `<div class="term-marvin-response">` +
    `<img class="marvin-icon marvin-icon--${state}"` +
    ` src="/images/slack-entire-marvin-darkmode-success.gif"` +
    ` alt="" aria-hidden="true" />` +
    `<span class="tl-title">${text}</span>` +
    `</div>`;
}

export function randomResponse(key) {
  return pick(marvinResponses[key]);
}
