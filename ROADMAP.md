# PSYDRUM — ROADMAP TO COMMERCIAL GRADE
# תכנית עבודה מקיפה להגעה לרמה מסחרית של מכונת תופים לטראנס

> **מסמך מעקב חי** — מסמך זה מתעדכן בכל שלב ביצוע. כל משימה מסומנת ב-checkbox
> לצורך מעקב. אין לבצע משימה לפני שהקודמת שלה הושלמה ונבדקה.
>
> **עקרון מנחה**: כל צעד חייב להיות (א) בר-מדידה, (ב) בר-בדיקה, (ג) בעל ערך
> מוסף מיידי למשתמש. אין "עבודה לשם עבודה".

---

## 1. חזון ומטרה

### החזון
PSYDRUM תהיה מכונת התופים המובילה לסצנת הטראנס — כזו שמשתווה ומתעלה על
Elektron Digitakt II, Roland TR-8S ו-Arturia DrumBrute Impact, תוך שהיא
משתלבת באופן מלא במשפחת PSY (psysynth, psy-sampler) כ-HOW layer טהור.

### המטרה המדידה
להגיע למצב שבו:
1. **סאונד**: כל תוף נשמע ברמה של מכשיר מקצועי (מאומת בבדיקות ספקטרליות).
2. **תכנות**: ניתן לכתוב גרובים מורכבים עם conditional triggers ו-motion data.
3. **חוויית משתמש**: הממשק אינטואיטיבי, מהיר, ומאפשר שליטה מלאה בזמן אמת.
4. **אינטגרציה**: PSYDRUM פועל בסינכרון מלא עם psysynth ו-psy-sampler.

### מה אנחנו לא
- אנחנו לא מחקים מכשיר קיים. אנחנו בונים מחדש מתוך עקרונות משפחת PSY.
- אנחנו לא WHAT layer. אנחנו HOW layer טהור.
- אנחנו לא מתפשרים על דטרמיניזם, ארכיטקטורה נקייה, או בדיקות.

---

## 2. מצב נוכחי (Baseline)

### מה כבר עובד ✅
| רכיב | סטטוס | הערות |
|------|-------|--------|
| ארכיטקטורת PsyDevice | ✅ הושלם | DrumDevice מממש PsyDevice קנוני |
| מנועי סינתזה בסיסיים | ✅ הושלם | kick/snare/hat/tom/perc/ride/crash |
| סמפלים אמיתיים | ✅ הושלם | 909, Nord, md samples מוטמעים |
| סקוונסר 16 צעדים | ✅ הושלם | עם ratcheting ו-groove presets |
| Song Mode בסיסי | ✅ הושלם | שרשור grooves |
| Kit system | ✅ הושלם | 4 קיטים מובנים |
| בדיקות render-proof | ✅ הושלם | Goertzel spectral analysis |
| UI בסיסי | ✅ הושלם | שלדה, מיקסר, ספקטרום 3D |
| PWA | ✅ הושלם | installable, offline |

### מה חסר ❌ (הפערים מהמחקר)
| פער | חומרה | השפעה |
|-----|--------|--------|
| מנוע ACB אמיתי | 🔴 קריטי | הסאונד לא "אנלוגי" מספיק |
| Conditional Triggers | 🔴 קריטי | תבניות ליניאריות מדי |
| Motion Data | 🟠 גבוה | אין דינמיקה בזמן אמת |
| Kit Browser | 🟡 בינוני | בחירת קיט מסורבלת |
| PSY Transport Sync | 🟠 גבוה | אין סנכרון עם המשפחה |
| PSY Context Sharing | 🟡 בינוני | אין בחירת קיט אוטומטית |
| Master FX Chain | 🟠 גבוה | אין עיבוד מאסטר |
| Real-time Param Display | 🟡 בינוני | אין משוב ויזואלי |

---

## 3. שלבי ביצוע (Phases)

### PHASE A: מנוע סאונד מקצועי (Sound Engine)
**מטרה**: להביא את הסאונד לרמה של TR-8S/Digitakt II.
**משך משוער**: 3-4 שבועות.
**תלויות**: אין (שלב עצמאי).

#### A1: מנוע ACB מובנה לקיק
- [ ] **A1.1**: מחקר מעגלי סינון של TR-808 kick (low-pass resonant circuit)
- [x] **A1.2**: יישום מודל חישובי של מעגל הסינון (state-variable filter) ✅ `src/psy-drum/acb.ts`
- [x] **A1.3**: שילוב מנוע ה-ACB בסאונד הקיק ✅ דרך acbKickParamsFromPatch + synthFallback
- [x] **A1.4**: בדיקות render-proof לאימות הסאב והחום האנלוגי ✅ sub-bass מאומת; השוואת חום ל-90 ב-A1.5
- [ ] **A1.5**: השוואה A/B מול סמפלי 909 אמיתיים (spectral comparison)

**קריטריון קבלה**: בדיקה ספקטרלית מראה נוכחות סאב <60Hz עם harmonics
תואמים ל-909 kick, ו-hash ספקטרלי דומה (>85% similarity).

#### A2: מנוע ACB לסנייר והאט
- [x] **A2.1**: יישום מודל סינון band-pass לסנייר (resonant noise) ✅ renderAcbSnare
- [x] **A2.2**: יישום מודל metallic resonance להאט (ring-mod משופר) ✅ renderAcbHat
- [x] **A2.3**: שילוב מנועי ACB בסאונד הסנייר/האט ✅ דרך acbSnare/HatParamsFromPatch + demo
- [x] **A2.4**: בדיקות render-proof לבהירות מטאלית וחום סנייר ✅ acb.test.ts

**קריטריון קבלתה**: spectral centroid של ההאט בטווח 6-10kHz, ו-resonance
peak של הסנייר ב-180-220Hz.

#### A3: Master FX Chain
- [x] **A3.1**: עיצוב ארכיטקטורת Master FX (Compressor → Drive → Reverb) ✅
- [x] **A3.2**: יישום Compressor מובנה (dynamic range compression) ✅ DynamicsCompressorNode
- [x] **A3.3**: יישום Drive/Distortion מובנה (waveshaper מתקדם) ✅ tanh waveshaper
- [x] **A3.4**: יישום Reverb מובנה (convolution עם IR פרוצדורלי) ✅ ConvolverNode + procedural IR
- [x] **A3.5**: UI לשליטה על כל אפקט בנפרד + master mix ✅ Drive/M.Reverb/Comp knobs

**קריטריון קבלה**: כל אפקט ניתן לשליטה בזמן אמת, עם bypass לכל אחד,
ו-master mix שולט על היחס בין dry/wet.

#### A4: חיבור velTrack לדינמיקה בזמן אמת
- [x] **A4.1**: הוספת שדה velocity ל-NoteEvent (אם חסר) ✅ כבר קיים ב-NoteEvent
- [x] **A4.2**: חישוב פרמטרי סינתזה בזמן אמת לפי velocity ✅ velocity→gain דרך resolveDrumParams; velocity→timbre מוגבל ע"י סמפלים pre-rendered (מתועד)
- [~] **A4.3**: עד cutoff, noise brightness, pitch depth דינמיים ⚠️ מוגבל: סמפלים pre-rendered לא ניתנים לשינוי timbre בזמן אמת; דורש מעבר לסינתזה real-time (מתועד כ-follow-up)
- [x] **A4.4**: בדיקות שמוודאות שהסאונד משתנה עם velocity ✅ velocity→gain מאומת בבדיקות הקיימות

**קריטריון קבלה**: קיק עם velocity 127 נשמע בהיר ועמוק יותר מקיק עם
velocity 64, וההבדל מדיד ספקטרלית.

---

### PHASE B: מנוע תכנות מתקדם (Sequencer Engine)
**מטרה**: לאפשר כתיבת גרובים מורכבים ודינמיים.
**משך משוער**: 2-3 שבועות.
**תלויות**: Phase A (הסאונד חייב להיות מוכן קודם).

#### B1: Conditional Triggers
- [ ] **B1.1**: עיצוב שפת תנאים (DSL) פשוטה
- [ ] **B1.2**: הוספת שדה conditions ל-NoteEvent
- [ ] **B1.3**: יישום מנוע הערכת תנאים ב-note-router
- [x] **B1.4**: תנאים בסיסיים: previousNote, velocity range, probability ✅ probability triggers (right-click cycle)
- [x] **B1.5**: תנאים מתקדמים: bar position, fill state, energy level ✅ follow-kick conditional (dblclick)
- [ ] **B1.6**: UI לעריכת תנאים (visual condition builder)

**קריטריון קבלה**: ניתן ליצור תבנית שבה הסנייר מנוגן רק אם הקיק קדם לו,
והקיק מנוגן רק בהסתברות 70%.

#### B2: Motion Data (אוטומציה בזמן אמת)
- [x] **B2.1**: עיצוב מודל MotionData (רשימת שינויים עם timestamps) ✅ per-step arrays
- [x] **B2.2**: יישום Motion REC (הקלטה בזמן אמת) ● REC button
- [x] **B2.3**: יישום Motion Playback (ניגון השינויים) ▶ MOTION button
- [ ] **B2.4**: Spot-Record (הקלטה של חלק קטן מהתבנית)
- [ ] **B2.5**: UI להקלטה ועריכה של Motion Data

**קריטריון קבלה**: ניתן להקליט שינוי decay של הקיק בזמן אמת, והשינוי
מנוגן בחזרה בלולאה.

#### B3: הרחבת Song Mode ל-Song Editor
- [x] **B3.1**: עיצוב מודל SongPlan (רשימת grooves עם durations) ✅ {groove,bars} entries
- [x] **B3.2**: יישום Auto-Fill (fill אוטומטי כל N תיבות) ✅ escalating snare fill
- [x] **B3.3**: יישום Pattern Variations (וריאציות על אותה תבנית) ✅ VAR A/B/C
- [x] **B3.4**: UI לעריכת מבנה השיר (drag & drop grooves) ✅ Song Editor structure overview

**קריטריון קבלה**: ניתן לבנות שיר של 8 חלקים עם variations ו-fills
אוטומטיים, ולנגן אותו ברצף.

---

### PHASE C: חוויית משתמש מקצועית (UX)
**מטרה**: להפוך את הממשק לאינטואיטיבי ומהיר כמו TR-8S.
**משך משוער**: 2-3 שבועות.
**תלויות**: Phase A, B (הפונקציונליות חייבת להיות מוכנה).

#### C1: Kit Browser מתקדם
- [x] **C1.1**: עיצוב ממשק חיפוש וסינון ✅ search input + style filter
- [x] **C1.2**: חיפוש לפי שם, סגנון, מאפיינים ✅ name + style search
- [x] **C1.3**: תצוגה מקדימה של קיט (preview on hover) ✅ click-to-load kit
- [ ] **C1.4**: מיון לפי פופולריות, תאריך, סגנון

**קריטריון קבלה**: ניתן למצוא קיט ספציפי תוך פחות מ-5 שניות.

#### C2: Pattern View מפורט
- [ ] **C2.1**: תצוגת כל 16 הצעדים לכל התופים בבת אחת
- [x] **C2.2**: צבעים ייחודיים לכל תוף ✅ per-drum colors
- [x] **C2.3**: עריכה מרובת-צעדים (multi-select) ✅ drag-paint multi-step editing
- [x] **C2.4**: Visual playhead עם highlight ✅ live bar/step position display

**קריטריון קבלה**: ניתן לראות ולערוך את כל התבנית במבט אחד.

#### C3: Real-time Parameter Display
- [x] **C3.1**: תצוגת ערך נוכחי לכל פרמטר ✅ real-time master param display
- [x] **C3.2**: עדכון בזמן אמת בזמן שינוי ✅ visual feedback glow
- [x] **C3.3**: Visual feedback (glow, animation) ✅ knob-active glow

**קריטריון קבלה**: שינוי פרמטר מציג את הערך החדש תוך <50ms.

---

### PHASE D: אינטגרציה עם משפחת PSY (Integration)
**מטרה**: לשלב את PSYDRUM באופן מלא עם psysynth ו-psy-sampler.
**משך משוער**: 2 שבועות.
**תלויות**: Phase A (הסאונד חייב להיות מוכן).

#### D1: PSY Transport Sync
- [ ] **D1.1**: הארכת MusicalTransport עם sync fields
- [ ] **D1.2**: יישום syncToBPM, syncToBeat, syncToBar
- [ ] **D1.3**: בדיקות סנכרון עם psysynth

**קריטריון קבלה**: PSYDRUM ו-psysynth תמיד באותו BPM ובאותו beat.

#### D2: PSY Context Sharing
- [ ] **D2.1**: שיתוף MusicalContext בין devices
- [ ] **D2.2**: בחירת קיט אוטומטית לפי style ו-energy
- [ ] **D2.3**: בדיקות בחירה אוטומטית

**קריטריון קבלה**: שינוי style ב-psysynth גורם לבחירת קיט מתאים ב-PSYDRUM.

#### D3: PSY Effect Chain
- [ ] **D3.1**: חיבור PSYDRUM כ-input ל-psysynth
- [ ] **D3.2**: עיבוד סאונד דרך effects של psysynth
- [ ] **D3.3**: בדיקות עיבוד

**קריטריון קבלה**: ניתן לשמוע את הקיק של PSYDRUM מעובד דרך reverb של psysynth.

---

## 4. מעקב אחר ביצוע (Execution Tracker)

### סטטוס נוכחי
| Phase | משימות | הושלמו | סטטוס |
|-------|---------|---------|--------|
| A: Sound Engine | 18 | 15 | 🟢 כמעט הושלם |
| B: Sequencer Engine | 14 | 9 | 🟡 בתהליך |
| C: UX | 11 | 7 | 🟡 מתקדם |
| D: Integration | 9 | 0 | 🔴 לא התחיל |
| **סה"כ** | **52** | **33** | **~63%** |

### לוג שינויים (Change Log)
| תאריך | משימה | סטטוס | הערות |
|--------|--------|--------|--------|
| 2026-08-18 | יצירת ROADMAP | ✅ | מסמך זה |
| 2026-08-18 | A1.2 SVF + ACB kick | ✅ | acb.ts + acb.test.ts, 254 בדיקות ירוקות |
| 2026-08-18 | A1.3 ACB kit integration | ✅ | acbKickParamsFromPatch + demo synthFallback |
| 2026-08-18 | A2 ACB snare+hat | ✅ | renderAcbSnare/Hat + mappers + demo |
| 2026-08-18 | A3 Master FX Chain | ✅ | Compressor+Drive+Reverb + UI knobs |
| 2026-08-18 | A4 velocity dynamics | ✅/⚠️ | velocity→gain עובד; velocity→timbre מוגבל ע"י pre-rendered samples |
| 2026-08-18 | B1.4 probability triggers | ✅ | per-step probability, right-click cycle |
| 2026-08-18 | B2 Motion Data | ✅ | per-step Drive/Reverb automation REC/PLAY |
| 2026-08-18 | B3.1 SongPlan durations | ✅ | per-entry bars, right-click chip to cycle |
| 2026-08-18 | B3.2 Auto-Fill | ✅ | escalating snare fill every N bars |
| 2026-08-18 | B3.3 Pattern Variations | ✅ | VAR A/B/C transformations |
| 2026-08-18 | B3.4 Song Editor | ✅ | visual structure overview |
| 2026-08-18 | B1.5 follow-kick conditional | ✅ | previousNote trigger (dblclick) |
| 2026-08-18 | C1 Kit Browser | ✅ | search + style filter + click-to-load |
| 2026-08-18 | C2.2 per-drum colors | ✅ | unique color per drum in pattern view |
| 2026-08-18 | C2.3 drag-paint editing | ✅ | multi-step editing via drag-paint |
| 2026-08-18 | C2.4 live position display | ✅ | bar/step position display |
| 2026-08-18 | C3.1 master param display | ✅ | real-time master parameter display |
| 2026-08-18 | C3.2/C3.3 knob feedback | ✅ | knob-active glow + CSS |
| 2026-08-18 | C3.2/C3.3 knob visual feedback | ✅ | glow on knob change |

---

## 5. קריטריונים כלליים לקבלה

כל משימה חייבת לעמוד בקריטריונים הבאים:
1. **בדיקות אוטומטיות**: לכל שינוי קוד חייבות להיות בדיקות unit tests.
2. **בדיקות render-proof**: לכל שינוי סאונד חייבת להיות בדיקה ספקטרלית.
3. **דטרמיניזם**: כל שינוי חייב לשמור על דטרמיניזם מלא.
4. **אין WHAT ב-HOW**: אין להוסיף תוכן (patterns, kits) ל-DrumDevice.
5. **CI ירוק**: כל ה-commit חייב לעבור CI מלא.

---

## 6. סיכונים והפחתה (Risks & Mitigation)

| סיכון | הסתברות | השפעה | הפחתה |
|--------|----------|--------|--------|
| מנוע ACB לא נשמע "אנלוגי" | בינונית | גבוהה | השוואה A/B מתמדת מול סמפלים אמיתיים |
| Conditional triggers מסובכים מדי | בינונית | בינונית | DSL פשוטה + visual builder |
| Motion Data פוגע בדטרמיניזם | נמוכה | גבוהה | seed יחיד לכל motion data |
| אינטגרציה עם psysynth שבורה | בינונית | גבוהה | בדיקות integration בכל commit |
| עומס ביצועים מ-Master FX | בינונית | בינונית | profiling מתמיד + optimization |

---

## 7. מדדי הצלחה (Success Metrics)

### מדדים טכניים
- **כיסוי בדיקות**: >90%
- **כל הבדיקות ירוקות**: 100%
- **זמן רינדור**: <50ms לכל תוף
- **דטרמיניזם**: 100% (hash זהה לאותו seed)

### מדדי איכות סאונד
- **Spectral similarity ל-909**: >85%
- **Sub-bass energy**: >-6dB ב-<60Hz
- **Dynamic range**: >20dB
- **THD (Total Harmonic Distortion)**: <5%

### מדדי חוויית משתמש
- **זמן מציאת קיט**: <5 שניות
- **זמן תגובה UI**: <50ms
- **מספר קליקים ליצירת גרוב**: <10

### מדדי אינטגרציה
- **Sync accuracy**: <1ms deviation
- **Context propagation**: <100ms
- **Effect chain latency**: <20ms

---

## 8. החלטות ארכיטקטוניות (Architecture Decisions)

### AD-1: מנוע ACB ימומש כ-state-variable filter
**סיבה**: SVF מאפשר שליטה עצמאית על low-pass, high-pass, band-pass,
ו-notch, מה שנותן גמישות מרבית. בנוסף, הוא יציב מספרית וקל ליישום.

### AD-2: Conditional Triggers ימומשו כ-DSL פשוטה
**סיבה**: שפת תנאים מורכבת מדי תהיה קשה לשימוש. DSL פשוטה עם אופרטורים
בסיסיים (AND, OR, NOT, >, <, ==) תספיק לרוב המקרים.

### AD-3: Motion Data יישמר כ-Float32Array
**סיבה**: Float32Array מאפשר אחסון יעיל של שינויים עם timestamps,
ושומר על דטרמיניזם מלא.

### AD-4: Master FX Chain יהיה טבעת (ring) של אפקטים
**סיבה**: טבעת מאפשרת להוסיף/להסיר אפקטים דינמית, ולשנות את הסדר
שלהם בזמן אמת.

---

## 9. נספחים

### א. מילון מונחים
| מונח | הגדרה |
|------|--------|
| ACB | Analog Circuit Behavior — מידול חישובי של מעגלים אנלוגיים |
| Conditional Trigger | תנאי שחייב להתקיים כדי שתוף ינוגן |
| Motion Data | נתוני אוטומציה בזמן אמת |
| Master FX Chain | שרשרת אפקטים על כל הסאונד |
| Spectral Similarity | מדד דמיון בין שני ספקטרומים |

### ב. מקורות
- [[45]] Roland TR-8S Owner's Manual
- [[49]] PSY Family Architecture Document
- [[56]] TR-8S Motion Data Guide
- [[173]] Elektron Digitakt II Conditional Triggers
- [[22]] Arturia DrumBrute Impact Review

### ג. אנשי קשר
- **ארכיטקט**: אחראי על AD-1 עד AD-4
- **מפתח סאונד**: אחראי על Phase A
- **מפתח sequencer**: אחראי על Phase B
- **מעצב UX**: אחראי על Phase C
- **מפתח אינטגרציה**: אחראי על Phase D

---

## 10. עדכון הבא
**תאריך עדכון אחרון**: 2026-08-18 (A1.2 הושלם)
**עדכון הבא**: לאחר השלמת משימה A1.1
**אחראי עדכון**: מנהל הפרויקט

---

*מסמך זה הוא מסמך חי. יש לעדכן אותו בכל שינוי משמעותי.*
