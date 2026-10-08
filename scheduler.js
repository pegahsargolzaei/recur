// Recur scheduling rules. Pure functions on plain word objects and "YYYY-MM-DD" date keys,
// so the page and tests.html share exactly the same logic.
(function (root) {
  // Review interval for each step, in days. A word at step index i is next due STEPS[i] days later.
  const STEPS = [1, 3, 7, 14, 30, 60];
  const LAST = STEPS.length - 1;
  const SESSION_SIZES = [5, 10, 15, 20, "all"];
  const DEFAULT_SETTINGS = { newPerDay: 5, examDate: "", direction: "word" };

  const pad = n => String(n).padStart(2, "0");
  const toKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (key, n) => { const d = fromKey(key); d.setDate(d.getDate() + n); return toKey(d); };
  const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

  // With an exam date, nothing is scheduled later than the day before the exam,
  // so every word comes back at least once in the final 7 days (the longest gap it can
  // still jump inside that window is capped here). Never schedules today or earlier.
  function capDue(due, today, examDate) {
    if (!examDate || today >= examDate) return due;
    const last = addDays(examDate, -1);
    if (due <= last) return due;
    const tomorrow = addDays(today, 1);
    return last > tomorrow ? last : tomorrow;
  }

  // A word saved from Add Word: new until its first practice, first due tomorrow.
  function newWord(fields, settings, today) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    return { ...fields, step: 0, interval: STEPS[0], mastered: false, isNew: true, introducedAt: null, reviewedAt: null,
      due: capDue(addDays(today, STEPS[0]), today, s.examDate) };
  }

  // Words saved before steps existed: step 1 (the 1-day step), due today, treated as review words.
  function migrate(word, today) {
    if (word.step !== undefined) return null;
    return { ...word, step: 0, interval: STEPS[0], mastered: false, isNew: false, introducedAt: null, reviewedAt: null, due: today };
  }

  // Got it / Missed it. `retry` is true when the word was already missed earlier in this session:
  // getting it right then only clears it from the session and keeps the 1-day step.
  function answer(word, correct, settings, today, retry) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const cur = Math.min(Math.max(word.step ?? 0, 0), LAST);
    let step = cur, mastered = !!word.mastered;
    if (!correct) { step = 0; mastered = false; }
    else if (retry) { step = 0; }
    else if (cur === LAST) { mastered = true; }
    else { step = cur + 1; }
    const interval = STEPS[step];
    return {
      ...word, step, interval, mastered, isNew: false,
      introducedAt: word.introducedAt || (word.isNew ? today : null),
      reviewedAt: today,
      due: capDue(addDays(today, interval), today, s.examDate),
    };
  }

  const byDueThenCreated = (a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : (a.created || 0) - (b.created || 0);

  // How many new words can still be introduced today (only words that were new when first practiced count).
  function newRemaining(words, settings, today) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const started = words.filter(w => w.introducedAt === today).length;
    return Math.max(0, s.newPerDay - started);
  }

  // Today's queue: due or overdue review words, most overdue first, then new words up to the daily limit,
  // cut to the chosen session size. `carried` = words that are due today but didn't fit.
  function buildQueue(words, settings, size, today) {
    const review = words.filter(w => !w.isNew && w.due <= today).sort(byDueThenCreated);
    const fresh = words.filter(w => w.isNew && w.due <= today).sort((a, b) => (a.created || 0) - (b.created || 0))
      .slice(0, newRemaining(words, settings, today));
    const all = review.concat(fresh);
    const take = size === "all" ? all.length : Math.max(0, Number(size) || 0);
    return { queue: all.slice(0, take).map(w => w.id), carried: Math.max(0, all.length - take), available: all.length };
  }

  // Extra practice, any time: words that aren't in today's regular queue, soonest review first.
  function buildExtraQueue(words, settings, size, today) {
    const regular = new Set(buildQueue(words, settings, "all", today).queue);
    const all = words.filter(w => !regular.has(w.id)).sort(byDueThenCreated);
    const take = size === "all" ? all.length : Math.max(0, Number(size) || 0);
    return { queue: all.slice(0, take).map(w => w.id), carried: Math.max(0, all.length - take), available: all.length };
  }

  // Extra practice answers: Got it leaves the schedule alone; Missed it goes back to the 1-day step.
  function extraAnswer(word, correct, settings, today) {
    return correct ? word : answer(word, false, settings, today);
  }

  function homeCounts(words, settings, today) {
    return {
      due: words.filter(w => !w.isNew && w.due <= today).length,
      newWaiting: words.filter(w => w.isNew).length,
      newToday: Math.min(words.filter(w => w.isNew && w.due <= today).length, newRemaining(words, settings, today)),
      mastered: words.filter(w => w.mastered).length,
    };
  }

  // Earliest day anything becomes practicable after today.
  function nextPracticeDate(words, today) {
    const tomorrow = addDays(today, 1);
    let best = null;
    for (const w of words) {
      const d = w.due > today ? w.due : tomorrow;
      if (!best || d < best) best = d;
    }
    return best;
  }

  root.RecurScheduler = { STEPS, SESSION_SIZES, DEFAULT_SETTINGS, addDays, daysBetween, capDue, newWord, migrate, answer, newRemaining, buildQueue, buildExtraQueue, extraAnswer, homeCounts, nextPracticeDate };
})(typeof window !== "undefined" ? window : globalThis);
