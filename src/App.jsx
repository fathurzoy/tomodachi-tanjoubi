import { useState, useEffect, useRef } from 'react';
import { birthdays, zodiacData, translations, flags, langNames, getZodiac, getFortune } from './data/zodiac';

const GEMINI_KEYS = [
    import.meta.env.VITE_GEMINI_API_KEY_1,
    import.meta.env.VITE_GEMINI_API_KEY_2,
    import.meta.env.VITE_GEMINI_API_KEY_3
].filter(Boolean);

// Session Storage Helpers for Caching
const getCachedHoroscope = (name, month, day, lang) => {
    try {
        const key = `horoscope_${name}_${month}_${day}_${lang}`;
        const item = sessionStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.error("Error reading cache", e);
        return null;
    }
};

const setCachedHoroscope = (name, month, day, lang, data) => {
    try {
        const key = `horoscope_${name}_${month}_${day}_${lang}`;
        sessionStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error("Error writing cache", e);
    }
};

const hasAnyCachedHoroscope = (name, month, day) => {
    try {
        const prefix = `horoscope_${name}_${month}_${day}_`;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("Error checking cache keys", e);
        return false;
    }
};

const getAnyCachedHoroscope = (name, month, day) => {
    try {
        const prefix = `horoscope_${name}_${month}_${day}_`;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const item = sessionStorage.getItem(key);
                if (item) {
                    const parsed = JSON.parse(item);
                    if (parsed && parsed.birthdayWish) {
                        return {
                            data: parsed,
                            sourceLang: key.slice(prefix.length)
                        };
                    }
                }
            }
        }
        return null;
    } catch (e) {
        console.error("Error reading any cache", e);
        return null;
    }
};

async function fetchAiTranslation(originalData, targetLanguage) {
    const languageNames = {
        ja: "Japanese",
        id: "Indonesian",
        en: "English",
        zh: "Chinese",
        my: "Burmese (Myanmar)",
        ne: "Nepali",
        si: "Sinhala"
    };

    const targetLangName = languageNames[targetLanguage] || "Japanese";

    const prompt = `You are a professional, warm translator for NICC (Nihon Indonesian Collaboration Community). Translate the following birthday/zodiac forecast JSON into ${targetLangName}. 
    
    You MUST output valid, pure JSON in ${targetLangName} language. Do NOT add any markdown wrapping like \`\`\`json or backticks, just output raw JSON text containing exactly the same keys and structure.
    
    CRITICAL: 
    1. Maintain the exact same numerical scores in "luckScores". Do NOT change any of the numbers in love, money, study, and health.
    2. Keep the elegant, polite, and warm tone of the Japanese astrologer (NICC style) but natural and grammatically correct in ${targetLangName}.
    3. Do NOT add any new fields. Translate all string values of the keys: birthdayWish, characterReading, zodiacMessage, yearlyPrediction, solution, goodNews, and futureAdvice.
    
    Here is the JSON to translate:
    ${JSON.stringify(originalData, null, 2)}`;

    // Try keys sequentially, starting with a random index to distribute the load
    const keysToTry = [...GEMINI_KEYS];
    const startIdx = Math.floor(Math.random() * keysToTry.length);
    const orderedKeys = [
        ...keysToTry.slice(startIdx),
        ...keysToTry.slice(0, startIdx)
    ];

    let lastError = null;

    for (let i = 0; i < orderedKeys.length; i++) {
        const key = orderedKeys[i];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API error status ${response.status}`);
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) {
                throw new Error("Empty response from AI API");
            }

            const cleanJsonText = rawText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
            return JSON.parse(cleanJsonText);

        } catch (err) {
            console.warn(`Translation: Key index ${GEMINI_KEYS.indexOf(key)} failed, trying next...`, err);
            lastError = err;
        }
    }

    throw new Error(lastError ? `TRANSLATION_FAILED: ${lastError.message}` : "TRANSLATION_FAILED");
}

async function fetchGeminiHoroscope(name, month, day, zodiacName, language) {
    const languageNames = {
        ja: "Japanese",
        id: "Indonesian",
        en: "English",
        zh: "Chinese",
        my: "Burmese (Myanmar)",
        ne: "Nepali",
        si: "Sinhala"
    };

    const targetLang = languageNames[language] || "Japanese";
    const currentYear = new Date().getFullYear();

    const prompt = `You are a warm Japanese astrologer and birthday card reader for NICC (Nihon Indonesian Collaboration Community). Create a highly personalized and friendly birthday/zodiac reading for:
    - Name: ${name}
    - Birth Date: Day ${day} of Month ${month} (Zodiac Sign: ${zodiacName})
    - Current Year: ${currentYear}
    
    You MUST output valid, pure JSON in ${targetLang} language. Do NOT add any markdown wrapping like \`\`\`json or backticks, just output raw JSON text containing exactly these keys:
    1. birthdayWish: A creative and warm birthday congratulatory message written ON BEHALF of the NICC community in ${targetLang} language, wishing them success, joy, and improvement in Japanese.
    2. characterReading: A deep, positive reading of their core personality traits.
    3. zodiacMessage: An inspiring one-line tagline/motto for their zodiac sign for the year ${currentYear} (max 15 words).
    4. yearlyPrediction: An exciting layout of how this year ${currentYear} will go (study/career, lifestyle, connections).
    5. solution: Challenges they might face this year and the wise solutions to overcome them.
    6. goodNews: Specific good news or positive fortune waiting for them this year.
    7. futureAdvice: A motivational, wise advice for their future steps.
    8. luckScores: An object containing integer scores from 1 to 5 representing:
       - love: integer between 1 and 5
       - money: integer between 1 and 5
       - study: integer between 1 and 5
       - health: integer between 1 and 5
    
    Keep the tone extremely positive, inspiring, and encouraging! Output JSON only.`;

    // Try keys sequentially, starting with a random index to distribute the load
    const keysToTry = [...GEMINI_KEYS];
    const startIdx = Math.floor(Math.random() * keysToTry.length);
    const orderedKeys = [
        ...keysToTry.slice(startIdx),
        ...keysToTry.slice(0, startIdx)
    ];

    let lastError = null;

    for (let i = 0; i < orderedKeys.length; i++) {
        const key = orderedKeys[i];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API error status ${response.status}`);
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) {
                throw new Error("Empty response from AI API");
            }

            const cleanJsonText = rawText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
            return JSON.parse(cleanJsonText);

        } catch (err) {
            console.warn(`Key index ${GEMINI_KEYS.indexOf(key)} failed, trying next...`, err);
            lastError = err;
        }
    }

    throw new Error(lastError ? `ALL_KEYS_FAILED: ${lastError.message}` : "ALL_KEYS_FAILED");
}

const melody = [
    [261.63, 0.4], [261.63, 0.4], [293.66, 0.8], [261.63, 0.8], [349.23, 0.8], [329.63, 1.2],
    [261.63, 0.4], [261.63, 0.4], [293.66, 0.8], [261.63, 0.8], [392.00, 0.8], [349.23, 1.2],
    [261.63, 0.4], [261.63, 0.4], [523.25, 0.8], [440.00, 0.8], [349.23, 0.8], [329.63, 0.8], [293.66, 1.2],
    [466.16, 0.4], [466.16, 0.4], [440.00, 0.8], [349.23, 0.8], [392.00, 0.8], [349.23, 1.2]
];

export default function App() {
    // Language & Routing State
    const [currentLang, setCurrentLang] = useState('ja');
    const [route, setRoute] = useState('card');
    const [isLangOpen, setIsLangOpen] = useState(false);

    // Card State
    const [currentName, setCurrentName] = useState('GUEST');
    const [currentMonth, setCurrentMonth] = useState(1);
    const [currentDay, setCurrentDay] = useState(1);
    const [currentZodiac, setCurrentZodiac] = useState(0);
    const [hasOpened, setHasOpened] = useState(false);

    // Interactive States
    const [flipped, setFlipped] = useState(false);
    const [easterEggs, setEasterEggs] = useState([]);

    // AI state
    const [aiHoroscope, setAiHoroscope] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [showDetails, setShowDetails] = useState(false);

    // Audio Ref
    const [isPlaying, setIsPlaying] = useState(false);
    const audioCtxRef = useRef(null);
    const timeoutsRef = useRef([]);
    const activePlayingRef = useRef(false);
    const userHasInteractedRef = useRef(false);
    const userIntentionallyPausedRef = useRef(false);
    const currentNoteIndexRef = useRef(0);
    const melodyLoopActiveRef = useRef(false);

    // Canvas Ref
    const canvasRef = useRef(null);

    // Input States for creation form
    const [inputName, setInputName] = useState('');
    const [inputMonth, setInputMonth] = useState('');
    const [inputDay, setInputDay] = useState('');

    // Core function to fetch AI horoscope with key rotation and error handling
    const triggerFetch = async (name, month, day, zodiacIdx, lang) => {
        setAiLoading(true);
        setAiError(null);
        setAiHoroscope(null);
        setShowDetails(false);

        try {
            // Check if there is already a forecast in ANY language for this person/date
            const existing = getAnyCachedHoroscope(name, month, day);
            let data;

            if (existing) {
                // Translate the existing forecast directly!
                data = await fetchAiTranslation(existing.data, lang);
            } else {
                // Generate a fresh forecast for the first time
                const zName = zodiacData[zodiacIdx].name[lang];
                data = await fetchGeminiHoroscope(name, month, day, zName, lang);
            }
            
            // Save success to sessionStorage cache
            setCachedHoroscope(name, month, day, lang, data);
            setAiHoroscope(data);
        } catch (err) {
            console.error("AI fortune action failed after trying all keys:", err);
            const t = translations[lang] || translations['ja'];
            setAiError(t.aiError || "⚠️ AI is having issues. Please try again later.");
        } finally {
            setAiLoading(false);
        }
    };

    // Manual load function for AI horoscope
    const handleTellFortune = () => {
        triggerFetch(currentName, currentMonth, currentDay, currentZodiac, currentLang);
    };
    // Sync routing based on path / search params
    useEffect(() => {
        const handleRouting = () => {
            const pathname = window.location.pathname;
            const searchParams = new URLSearchParams(window.location.search);

            if (pathname === '/create' || window.location.hash === '#/create') {
                setRoute('create');
            } else {
                setRoute('card');
                const name = searchParams.get('name') || '';
                const monthStr = searchParams.get('month') || '';
                const dayStr = searchParams.get('day') || '';

                let finalName = name;
                let finalMonth = parseInt(monthStr);
                let finalDay = parseInt(dayStr);

                const today = new Date();

                if (!name || isNaN(finalMonth) || isNaN(finalDay)) {
                    finalMonth = today.getMonth() + 1;
                    finalDay = today.getDate();

                    const todayStr = `${String(finalMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
                    const birthdayPerson = birthdays.find(b => b.date === todayStr);
                    if (birthdayPerson) {
                        finalName = birthdayPerson.name;
                        finalMonth = birthdayPerson.month;
                        finalDay = birthdayPerson.day;
                    } else {
                        finalName = 'GUEST';
                    }
                }

                setCurrentName(finalName);
                setCurrentMonth(finalMonth);
                setCurrentDay(finalDay);

                const zodiacIndex = getZodiac(finalMonth, finalDay);
                setCurrentZodiac(zodiacIndex);

                // Set initial background theme
                const z = zodiacData[zodiacIndex];
                if (z) document.body.className = z.theme;

                // Reset AI states and sync from cache if it exists
                const cached = getCachedHoroscope(finalName, finalMonth, finalDay, currentLang);
                if (cached) {
                    setAiHoroscope(cached);
                    setAiLoading(false);
                    setAiError(null);
                } else {
                    setAiHoroscope(null);
                    setAiLoading(false);
                    setAiError(null);
                }
                setShowDetails(false);
            }
        };

        handleRouting();
        window.addEventListener('popstate', handleRouting);
        window.addEventListener('hashchange', handleRouting);

        return () => {
            window.removeEventListener('popstate', handleRouting);
            window.removeEventListener('hashchange', handleRouting);
        };
    }, [currentLang]);

    // Canvas particle effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let animationId;
        let particles = [];

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Optimize particle count for mobile
        const isMobile = window.innerWidth < 768;
        const numParticles = isMobile ? 15 : 80;

        for (let i = 0; i < numParticles; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                size: Math.random() * 6 + 2,
                color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#BB8FCE', '#FFA07A'][Math.floor(Math.random() * 5)],
                speedY: Math.random() * 2 + 1,
                speedX: Math.random() * 2 - 1,
                rotation: Math.random() * 360,
                rotSpeed: Math.random() * 4 - 2
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.y += p.speedY;
                p.x += p.speedX + Math.sin(p.y * 0.01) * 0.3;
                p.rotation += p.rotSpeed;
                if (p.y > canvas.height) {
                    p.y = -10;
                    p.x = Math.random() * canvas.width;
                }
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = 0.7;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });
            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [route, currentName]);

    // Scroll Reveal Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: "0px 0px -50px 0px"
        });

        const timeout = setTimeout(() => {
            const elements = document.querySelectorAll('.scroll-reveal');
            elements.forEach((el) => observer.observe(el));
        }, 100);

        return () => {
            clearTimeout(timeout);
            observer.disconnect();
        };
    }, [route, aiHoroscope, showDetails]);

    // Mesh Background Orbs
    const orbs = [
        { size: '280px', left: '15%', top: '25%', bg: 'radial-gradient(circle, #ff6b6b, transparent)', duration: '14s' },
        { size: '320px', left: '60%', top: '15%', bg: 'radial-gradient(circle, #4ecdc4, transparent)', duration: '18s' },
        { size: '250px', left: '40%', top: '65%', bg: 'radial-gradient(circle, #bb8fce, transparent)', duration: '16s' }
    ];

    // Music Player Logic
    const startMusic = () => {
        if (activePlayingRef.current) return;
        userIntentionallyPausedRef.current = false;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContextClass();
        }
        const ctx = audioCtxRef.current;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        activePlayingRef.current = true;
        setIsPlaying(true);

        if (melodyLoopActiveRef.current) return;
        melodyLoopActiveRef.current = true;

        const playTone = (freq, dur, startTime) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.12, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
            osc.start(startTime);
            osc.stop(startTime + dur);
        };

        const scheduleNext = (index, startTime) => {
            if (!activePlayingRef.current) {
                melodyLoopActiveRef.current = false;
                currentNoteIndexRef.current = index >= melody.length ? 0 : index;
                return;
            }

            if (index >= melody.length) {
                currentNoteIndexRef.current = 0;
                const timeoutId = setTimeout(() => {
                    if (activePlayingRef.current) {
                        scheduleNext(0, ctx.currentTime);
                    } else {
                        melodyLoopActiveRef.current = false;
                    }
                }, 500);
                timeoutsRef.current.push(timeoutId);
                return;
            }

            const [freq, dur] = melody[index];
            playTone(freq, dur, startTime);

            const nextTime = startTime + dur;
            const delayMs = (nextTime - ctx.currentTime) * 1000;

            const timeoutId = setTimeout(() => {
                scheduleNext(index + 1, nextTime);
            }, Math.max(0, delayMs - 50));

            timeoutsRef.current.push(timeoutId);
        };

        scheduleNext(currentNoteIndexRef.current, ctx.currentTime);
    };

    const stopMusic = (intentional = false) => {
        if (intentional) {
            userIntentionallyPausedRef.current = true;
        }
        activePlayingRef.current = false;
        setIsPlaying(false);
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        melodyLoopActiveRef.current = false;
    };

    const toggleMusic = () => {
        userHasInteractedRef.current = true;
        if (isPlaying) {
            stopMusic(true);
        } else {
            startMusic();
        }
    };

    // Clean up audio on unmount
    useEffect(() => {
        return () => {
            stopMusic(true);
        };
    }, []);

    // Autoplay & Visibility Logic
    useEffect(() => {
        const handleFirstInteraction = () => {
            if (!userHasInteractedRef.current) {
                userHasInteractedRef.current = true;
            }
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
            window.removeEventListener('touchstart', handleFirstInteraction);
        };

        window.addEventListener('click', handleFirstInteraction);
        window.addEventListener('keydown', handleFirstInteraction);
        window.addEventListener('touchstart', handleFirstInteraction);

        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (activePlayingRef.current) {
                    stopMusic(false); // Auto pause (not intentional)
                }
            } else {
                if (!userIntentionallyPausedRef.current) {
                    startMusic(); // Auto resume when visible
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
            window.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Emoji Splashes
    const spawnEmoji = (emoji) => {
        const id = Date.now() + Math.random();
        const left = Math.random() * 80 + 10 + '%';
        const top = Math.random() * 60 + 20 + '%';

        setEasterEggs(prev => [...prev, { id, emoji, left, top }]);
        setTimeout(() => {
            setEasterEggs(prev => prev.filter(item => item.id !== id));
        }, 1000);

        // Sub stars
        for (let i = 0; i < 5; i++) {
            const subId = Date.now() + Math.random();
            const star = ['✨', '🌟', '💫', '⭐'][Math.floor(Math.random() * 4)];
            const offsetLeft = (parseFloat(left) + (Math.random() * 10 - 5)) + '%';
            const offsetTop = (parseFloat(top) + (Math.random() * 10 - 5)) + '%';
            setTimeout(() => {
                setEasterEggs(prev => [...prev, { id: subId, emoji: star, left: offsetLeft, top: offsetTop }]);
                setTimeout(() => {
                    setEasterEggs(prev => prev.filter(item => item.id !== subId));
                }, 800);
            }, i * 80);
        }
    };

    // Card Generation
    const handleGenerateCard = () => {
        const name = inputName.trim() || 'Friend';
        const month = parseInt(inputMonth) || 1;
        const day = parseInt(inputDay) || 1;

        // Push routing path to History API
        const newUrl = `${window.location.origin}/?name=${encodeURIComponent(name)}&month=${month}&day=${day}`;
        window.history.pushState({}, '', newUrl);

        // Update states manually
        setCurrentName(name);
        setCurrentMonth(month);
        setCurrentDay(day);
        const zodiacIndex = getZodiac(month, day);
        setCurrentZodiac(zodiacIndex);
        setFlipped(false);
        setRoute('card');

        // Reset/Sync AI states based on cache
        const cached = getCachedHoroscope(name, month, day, currentLang);
        if (cached) {
            setAiHoroscope(cached);
            setAiLoading(false);
            setAiError(null);
        } else {
            setAiHoroscope(null);
            setAiLoading(false);
            setAiError(null);
        }
        setShowDetails(false);

        // Autoplay music when creating a card
        userHasInteractedRef.current = true;
        setHasOpened(true);
        startMusic();

        // Apply new background theme
        const z = zodiacData[zodiacIndex];
        if (z) document.body.className = z.theme;
    };



    const handleGoHome = () => {
        window.history.pushState({}, '', '/');
        setRoute('card');

        // Reset to Guest mode / dynamic date
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        const todayStr = `${String(todayMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
        const birthdayPerson = birthdays.find(b => b.date === todayStr);

        let finalName = 'GUEST';
        let finalMonth = todayMonth;
        let finalDay = todayDay;

        if (birthdayPerson) {
            finalName = birthdayPerson.name;
            finalMonth = birthdayPerson.month;
            finalDay = birthdayPerson.day;
            setCurrentName(birthdayPerson.name);
            setCurrentMonth(birthdayPerson.month);
            setCurrentDay(birthdayPerson.day);
            const z = getZodiac(birthdayPerson.month, birthdayPerson.day);
            setCurrentZodiac(z);
            document.body.className = zodiacData[z].theme;
        } else {
            setCurrentName('GUEST');
            setCurrentMonth(todayMonth);
            setCurrentDay(todayDay);
            const z = getZodiac(todayMonth, todayDay);
            setCurrentZodiac(z);
            document.body.className = zodiacData[z].theme;
        }
        setFlipped(false);
        setHasOpened(false);

        // Reset/Sync AI states based on cache
        const cached = getCachedHoroscope(finalName, finalMonth, finalDay, currentLang);
        if (cached) {
            setAiHoroscope(cached);
            setAiLoading(false);
            setAiError(null);
        } else {
            setAiHoroscope(null);
            setAiLoading(false);
            setAiError(null);
        }
        setShowDetails(false);
    };

    const activeTranslations = translations[currentLang] || translations['ja'];
    const activeZodiac = zodiacData[currentZodiac] || zodiacData[0];
    const fortuneData = getFortune(currentZodiac + currentName.length);

    const getStarRating = (score) => {
        const rating = Math.min(5, Math.max(1, typeof score === 'string' ? parseInt(score) : score || 3));
        return "★".repeat(rating) + "☆".repeat(5 - rating);
    };

    const displayFortune = (aiHoroscope && aiHoroscope.luckScores) ? {
        love: getStarRating(aiHoroscope.luckScores.love),
        money: getStarRating(aiHoroscope.luckScores.money),
        study: getStarRating(aiHoroscope.luckScores.study),
        health: getStarRating(aiHoroscope.luckScores.health)
    } : fortuneData;

    return (
        <div className="min-h-screen flex flex-col relative overflow-x-hidden pb-10">
            {/* Background Animations */}
            <canvas ref={canvasRef} className="particle-canvas" />
            <div className="mesh-bg">
                {orbs.map((orb, i) => (
                    <div
                        key={i}
                        className="mesh-orb"
                        style={{
                            width: orb.size,
                            height: orb.size,
                            left: orb.left,
                            top: orb.top,
                            background: orb.bg,
                            animationDuration: orb.duration
                        }}
                    />
                ))}
            </div>

            {/* Top Bar Navigation */}
            <div className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2.5 cursor-pointer group"
                >
                    <img
                        src="/app-logo.png"
                        className="w-10 h-10 rounded-xl object-cover shadow-[0_0_15px_rgba(255,215,0,0.2)] border border-white/15 group-hover:scale-105 group-hover:rotate-3 group-hover:shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all duration-300"
                        alt="Logo Nihongo Tomodachi"
                    />
                    <span className="text-white font-black text-lg hidden sm:block tracking-wide group-hover:text-yellow-300 transition-colors duration-300">Nihongo Tomodachi</span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Synth Music Button */}
                    <button
                        onClick={toggleMusic}
                        className={`glass-card p-3 rounded-full text-white hover:bg-white/20 transition-all ${isPlaying ? 'playing heartbeat' : ''}`}
                        title="Music"
                    >
                        {isPlaying ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                        )}
                    </button>

                    {/* Language Dropdown Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setIsLangOpen(!isLangOpen)}
                            className="glass-card px-4 py-2 rounded-full text-white font-bold text-sm flex items-center gap-2 hover:bg-white/20 transition-all"
                        >
                            <span>{flags[currentLang]}</span>
                            <span>{langNames[currentLang]}</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {isLangOpen && (
                            <div className="absolute top-[110%] right-0 min-width-[180px] bg-slate-950/95 backdrop-blur-md border border-white/10 rounded-2xl p-2 z-[100] shadow-2xl flex flex-col gap-1 w-44">
                                {Object.keys(flags).map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => {
                                            setCurrentLang(lang);
                                            setIsLangOpen(false);

                                            // Directly check cache or auto-translate on click to avoid synchronous state changes inside useEffect
                                            const cached = getCachedHoroscope(currentName, currentMonth, currentDay, lang);
                                            if (cached) {
                                                setAiHoroscope(cached);
                                                setAiLoading(false);
                                                setAiError(null);
                                            } else {
                                                if (hasAnyCachedHoroscope(currentName, currentMonth, currentDay)) {
                                                    triggerFetch(currentName, currentMonth, currentDay, currentZodiac, lang);
                                                } else {
                                                    setAiHoroscope(null);
                                                    setAiLoading(false);
                                                    setAiError(null);
                                                }
                                            }
                                        }}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-semibold hover:bg-white/10 transition-all text-white w-full ${currentLang === lang ? 'bg-white/20' : ''}`}
                                    >
                                        <span>{flags[lang]}</span>
                                        <span>{langNames[lang]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Render Splash Easter Eggs */}
            {easterEggs.map(egg => (
                <div
                    key={egg.id}
                    className="easter-egg"
                    style={{ left: egg.left, top: egg.top }}
                >
                    {egg.emoji}
                </div>
            ))}

            {/* MAIN APP CONTAINER */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 pt-24 relative z-20">

                {/* ===== OPEN CARD OVERLAY ===== */}
                {route === 'card' && !hasOpened && (
                    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
                        <div className="relative group cursor-pointer" onClick={() => {
                            setHasOpened(true);
                            userHasInteractedRef.current = true;
                            startMusic();
                            spawnEmoji('🎉');
                        }}>
                            {/* Glowing background */}
                            <div className="absolute -inset-4 bg-gradient-to-r from-yellow-500 via-pink-500 to-purple-500 rounded-full opacity-40 group-hover:opacity-75 blur-xl transition-all duration-500 animate-pulse"></div>
                            
                            {/* Envelope / Button body */}
                            <div className="relative glass-card-strong px-10 py-8 flex flex-col items-center gap-4 rounded-3xl border border-yellow-400/30 transform group-hover:scale-105 transition-all duration-500 shadow-[0_0_40px_rgba(255,215,0,0.2)]">
                                <div className="text-6xl animate-bounce">💌</div>
                                <h2 className="text-2xl md:text-3xl font-black text-white whitespace-nowrap shimmer-text">
                                    {currentLang === 'id' ? 'Buka Kartu Ucapan' : currentLang === 'ja' ? 'カードを開く' : 'Open Card'}
                                </h2>
                                <p className="text-white/60 text-sm font-semibold tracking-widest uppercase mt-1">
                                    {currentLang === 'id' ? 'Ketuk Untuk Membuka' : currentLang === 'ja' ? 'タップして開く' : 'Tap to Open'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== CARD SECTION ===== */}
                {route === 'card' && (
                    <div className={`w-full max-w-lg transition-all duration-1000 ease-out transform ${hasOpened ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none'}`}>
                        {/* Header Details */}
                        <div className="text-center mb-8">
                            <div className="inline-block mb-4 relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center text-3xl pulse-glow">
                                    🎂
                                </div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-xs animate-bounce">
                                    ✨
                                </div>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 bounce-in">
                                {activeTranslations.happyBirthday}
                            </h1>
                            <p className="text-xl md:text-2xl font-bold text-white/90 shimmer-text">{currentName}</p>
                            <p className="text-white/50 text-sm mt-2 font-mono">
                                {`${activeTranslations.todayDate}: ${new Date().getFullYear()}.${String(currentMonth).padStart(2, '0')}.${String(currentDay).padStart(2, '0')}`}
                            </p>
                        </div>

                        {/* Interactive 3D flip card */}
                        <div className="scroll-reveal mb-6">
                            <div className={`flip-card w-full ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
                                <div className="flip-card-inner min-h-[560px]">
                                    {/* Front Side */}
                                    <div className="flip-card-front glass-card-strong p-6 md:p-8 flex flex-col items-center justify-center">
                                    <div className="w-48 h-48 mb-4 floating" dangerouslySetInnerHTML={{ __html: activeZodiac.svg }} />
                                    <div className="tag mb-3">{activeTranslations.yourZodiac}</div>
                                    <h2 className="text-3xl font-black text-white mb-1">{activeZodiac.name[currentLang]}</h2>

                                    {/* EXPLICIT ZODIAC SYMBOL NAME */}
                                    <div className="flex flex-col items-center justify-center bg-yellow-500/10 px-4 py-2.5 rounded-xl border border-yellow-500/20 mb-3 w-full max-w-[280px] text-center">
                                        <span className="text-yellow-400 text-xs font-bold tracking-wider mb-1">✨ {activeTranslations.zodiacSymbol}</span>
                                        <span className="text-yellow-300 text-sm font-bold leading-snug">{activeZodiac.symbolName[currentLang] || activeZodiac.symbolName['en']}</span>
                                    </div>

                                    <p className="text-white/60 text-lg mb-1 font-semibold">{activeZodiac.reading}</p>
                                    <p className="text-white/40 text-sm mb-4 font-mono">{activeZodiac.dateRange}</p>
                                    <p className="text-white/50 text-sm animate-pulse">👆 {activeTranslations.tapToFlip}</p>
                                </div>

                                {/* Back Side */}
                                <div className="flip-card-back p-6 md:p-8 flex flex-col items-center justify-center text-center">
                                    <div className="text-4xl mb-4">✨🔮✨</div>
                                    <h3 className="text-xl font-bold text-white mb-3">{activeTranslations.character}</h3>
                                    <p className="text-white/80 text-sm leading-relaxed mb-4">
                                        {aiHoroscope ? aiHoroscope.characterReading : activeZodiac.character[currentLang]}
                                    </p>
                                    <div className="divider"></div>
                                    <p className="text-white text-base leading-relaxed font-semibold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-300 to-orange-400 font-black animate-shimmer py-0.5">
                                        {aiHoroscope ? aiHoroscope.zodiacMessage : activeZodiac.msg[currentLang]}
                                    </p>
                                    <div className="mt-4 text-white/40 text-sm">👆 {activeTranslations.tapToFlipBack}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                        {/* NICC Friends Wish */}
                        <div className="glass-card p-6 md:p-8 mb-6 text-center scroll-reveal">
                            <div className="flex justify-center gap-4 mb-4">
                                <span className="clickable-emoji text-3xl" onClick={() => spawnEmoji('🎉')}>🎉</span>
                                <span className="clickable-emoji text-3xl" onClick={() => spawnEmoji('🎂')}>🎂</span>
                                <span className="clickable-emoji text-3xl" onClick={() => spawnEmoji('🎁')}>🎁</span>
                                <span className="clickable-emoji text-3xl" onClick={() => spawnEmoji('🎈')}>🎈</span>
                                <span className="clickable-emoji text-3xl" onClick={() => spawnEmoji('✨')}>✨</span>
                            </div>
                            <p className="text-white text-lg leading-relaxed font-medium whitespace-pre-line">
                                {aiHoroscope ? aiHoroscope.birthdayWish : activeTranslations.birthdayMsg(currentName)}
                            </p>
                        </div>

                        {/* Interactive daily Fortune stars */}
                        <div className="glass-card p-5 mb-6 scroll-reveal">
                            <h3 className="text-white font-bold text-center mb-4 text-lg">{activeTranslations.fortune}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/5 rounded-2xl p-4 text-center cursor-pointer hover:bg-white/10 transition-all border border-white/5" onClick={() => spawnEmoji('💖')}>
                                    <div className="text-2xl mb-1">💘</div>
                                    <div className="text-xs font-bold text-white/70 mb-1">{activeTranslations.love}</div>
                                    <div className="text-xl font-black fortune-star text-pink-400">{displayFortune.love}</div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 text-center cursor-pointer hover:bg-white/10 transition-all border border-white/5" onClick={() => spawnEmoji('💵')}>
                                    <div className="text-2xl mb-1">💰</div>
                                    <div className="text-xs font-bold text-white/70 mb-1">{activeTranslations.money}</div>
                                    <div className="text-xl font-black fortune-star text-yellow-400">{displayFortune.money}</div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 text-center cursor-pointer hover:bg-white/10 transition-all border border-white/5" onClick={() => spawnEmoji('📚')}>
                                    <div className="text-2xl mb-1">📚</div>
                                    <div className="text-xs font-bold text-white/70 mb-1">{activeTranslations.study}</div>
                                    <div className="text-xl font-black fortune-star text-teal-400">{displayFortune.study}</div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 text-center cursor-pointer hover:bg-white/10 transition-all border border-white/5" onClick={() => spawnEmoji('🍀')}>
                                    <div className="text-2xl mb-1">🏃</div>
                                    <div className="text-xs font-bold text-white/70 mb-1">{activeTranslations.health}</div>
                                    <div className="text-xl font-black fortune-star text-green-400">{displayFortune.health}</div>
                                </div>
                            </div>
                        </div>

                        {/* ===== AI HOROSCOPE CARD ===== */}
                        <div className="glass-card-strong p-6 md:p-8 mb-6 border border-yellow-500/30 shadow-[0_0_30px_rgba(255,215,0,0.15)] relative scroll-reveal">
                            {/* Decorative lighting background effect */}
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                                    <div className="relative flex items-center justify-center">
                                        <span className="text-5xl animate-spin inline-block filter drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">🔮</span>
                                        <span className="absolute text-xl animate-ping opacity-75">✨</span>
                                    </div>
                                    <p className="text-yellow-400 font-bold text-lg animate-pulse tracking-wide font-sans">{activeTranslations.loadingAi}</p>
                                </div>
                            ) : aiError ? (
                                <div className="text-center py-6 px-4 space-y-4 flex flex-col items-center justify-center fade-in">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-3xl border border-red-500/20 shadow-lg pulse-glow">
                                        ⚠️
                                    </div>
                                    <div className="space-y-2 max-w-[320px]">
                                        <h4 className="text-red-400 font-extrabold text-lg tracking-wide">
                                            {activeTranslations.aiHoroscopeTitle.replace(/✨/g, '').trim()}
                                        </h4>
                                        <p className="text-white/80 text-sm leading-relaxed">
                                            {aiError}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleTellFortune}
                                        className="btn-modern btn-gold px-7 py-3.5 rounded-full text-base font-extrabold flex items-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.25)] border border-yellow-400/30 active:scale-95 group transition-all mt-2 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(255,215,0,0.4)] cursor-pointer"
                                    >
                                        <span>🔄</span>
                                        <span>{currentLang === 'id' ? 'Coba Lagi' : currentLang === 'ja' ? 'もう一度試す' : 'Try Again'}</span>
                                    </button>
                                </div>
                            ) : aiHoroscope ? (
                                <div className="space-y-5 fade-in">
                                    <h3 className="text-center font-black text-xl md:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 animate-shimmer py-1">
                                        {activeTranslations.aiHoroscopeTitle}
                                    </h3>

                                    <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 shadow-inner text-center">
                                        <p className="text-xs font-bold text-yellow-400/80 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5">
                                            <span>💌</span> {activeTranslations.happyBirthday} Message
                                        </p>
                                        <p className="text-white font-medium italic text-base leading-relaxed">
                                            "{aiHoroscope.birthdayWish}"
                                        </p>
                                    </div>

                                    {/* Click for detail button */}
                                    <div className="text-center">
                                        <button
                                            onClick={() => setShowDetails(!showDetails)}
                                            className="btn-modern mx-auto px-5 py-2.5 rounded-full flex items-center gap-2 border border-yellow-500/25 bg-yellow-500/5 hover:bg-yellow-500/10 text-yellow-300 text-sm font-bold transition-all shadow-[0_0_15px_rgba(253,224,71,0.05)] active:scale-95 cursor-pointer animate-pulse"
                                        >
                                            <span>{showDetails ? "✨" : "🔮"}</span>
                                            <span>{showDetails ? activeTranslations.closeDetails : activeTranslations.clickForDetails}</span>
                                            <svg
                                                className={`w-4 h-4 transition-transform duration-300 ${showDetails ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Expandable details with smooth transition */}
                                    <div 
                                         className={`transition-all duration-700 ease-in-out overflow-hidden space-y-4 pb-4 ${showDetails ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                         style={{ maxHeight: showDetails ? '3000px' : '0px' }}
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                            <div className="bg-slate-950/30 p-4 rounded-2xl border border-white/5 hover:border-yellow-500/10 transition-colors shadow-sm">
                                                <p className="text-sm font-bold text-yellow-400 mb-1.5 flex items-center gap-1.5">
                                                    <span>🌟</span> {activeTranslations.aiPrediction}
                                                </p>
                                                <p className="text-white/80 text-sm leading-relaxed text-left">{aiHoroscope.yearlyPrediction}</p>
                                            </div>
                                            <div className="bg-slate-950/30 p-4 rounded-2xl border border-white/5 hover:border-emerald-500/10 transition-colors shadow-sm">
                                                <p className="text-sm font-bold text-emerald-400 mb-1.5 flex items-center gap-1.5">
                                                    <span>🎁</span> {activeTranslations.aiGoodNews}
                                                </p>
                                                <p className="text-white/80 text-sm leading-relaxed text-left">{aiHoroscope.goodNews}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-slate-950/30 p-4 rounded-2xl border border-white/5 hover:border-red-500/10 transition-colors shadow-sm">
                                                <p className="text-sm font-bold text-red-400 mb-1.5 flex items-center gap-1.5">
                                                    <span>🛠️</span> {activeTranslations.aiSolution}
                                                </p>
                                                <p className="text-white/80 text-sm leading-relaxed text-left">{aiHoroscope.solution}</p>
                                            </div>
                                            <div className="bg-slate-950/30 p-4 rounded-2xl border border-white/5 hover:border-cyan-500/10 transition-colors shadow-sm">
                                                <p className="text-sm font-bold text-cyan-400 mb-1.5 flex items-center gap-1.5">
                                                    <span>🧭</span> {activeTranslations.aiAdvice}
                                                </p>
                                                <p className="text-white/80 text-sm leading-relaxed text-left">{aiHoroscope.futureAdvice}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 px-4 space-y-4 flex flex-col items-center justify-center fade-in">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-500/20 to-purple-500/20 flex items-center justify-center text-3xl border border-yellow-500/20 shadow-lg floating">
                                        🔮
                                    </div>
                                    <div className="space-y-1 max-w-[280px]">
                                        <h4 className="text-white font-extrabold text-lg tracking-wide">
                                            {activeTranslations.aiHoroscopeTitle.replace(/✨/g, '').trim()}
                                        </h4>
                                        <p className="text-white/60 text-xs leading-normal">
                                            {activeTranslations.tellFortuneDesc}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleTellFortune}
                                        className="btn-modern btn-gold px-7 py-3.5 rounded-full text-base font-extrabold flex items-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.25)] border border-yellow-400/30 active:scale-95 group transition-all mt-2 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(255,215,0,0.4)] cursor-pointer"
                                    >
                                        <span>🔮</span>
                                        <span>{activeTranslations.tellFortuneBtn}</span>
                                        <span className="inline-block transform transition-transform group-hover:translate-x-1 duration-200">✨</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Navigation Actions removed per request */}

                        {/* Bottom Brand */}
                        <div className="text-center text-white/40 text-sm mb-4">
                            <p>Nihongo Tomodachi | NICC の皆より 💖</p>
                        </div>
                    </div>
                )}

                {/* ===== CREATE CARD FORM SECTION ===== */}
                {route === 'create' && (
                    <div className="w-full max-w-md fade-up">
                        <div className="glass-card-strong p-8 border border-white/10 shadow-2xl">
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-3xl mx-auto mb-4 pulse-glow">
                                    ✨
                                </div>
                                <h1 className="text-3xl font-black text-white mb-2">Nihongo Tomodachi</h1>
                                <p className="text-white/60 text-sm">{activeTranslations.createSubtitle}</p>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="text-white/70 text-sm font-bold mb-2 block">{activeTranslations.nameLabel}</label>
                                    <input
                                        type="text"
                                        value={inputName}
                                        onChange={(e) => setInputName(e.target.value)}
                                        className="input-modern"
                                        placeholder="Name"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-white/70 text-sm font-bold mb-2 block">{activeTranslations.monthLabel}</label>
                                        <input
                                            type="number"
                                            value={inputMonth}
                                            onChange={(e) => setInputMonth(e.target.value)}
                                            min="1"
                                            max="12"
                                            className="input-modern"
                                            placeholder="1-12"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-white/70 text-sm font-bold mb-2 block">{activeTranslations.dayLabel}</label>
                                        <input
                                            type="number"
                                            value={inputDay}
                                            onChange={(e) => setInputDay(e.target.value)}
                                            min="1"
                                            max="31"
                                            className="input-modern"
                                            placeholder="1-31"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleGenerateCard}
                                    className="btn-modern btn-gold w-full justify-center text-lg py-4 shadow-lg flex items-center gap-2 mt-2"
                                >
                                    <span>🎉</span> <span>{activeTranslations.generate}</span>
                                </button>
                                <button
                                    onClick={handleGoHome}
                                    className="btn-modern w-full justify-center flex items-center gap-2 border border-white/10 bg-white/5 hover:bg-white/10"
                                >
                                    <span>←</span> <span>{activeTranslations.back}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
