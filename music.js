/* =====================================================================
 * 弋阳西街 · 国风背景音乐（Web Audio API 实时合成，无需音频文件）
 * 调式：D 宫五声音阶（宫商角徵羽）  速度：约 70 BPM 慢板，如老街漫步
 * 声部：古筝琶音 / 竹笛主旋律（颤音·倚音）/ 低音托底 / 碰铃·木鱼 / 氛围长音
 * ===================================================================== */
(function () {
    "use strict";
    if (window.__XIJIE_MUSIC__) return;   // 防止重复加载
    window.__XIJIE_MUSIC__ = {
        version: "1.1",
        /* 在进入子页面的点击手势中提前"预热"音频上下文（静音），
           之后从 iframe 内开关音乐就不再受自动播放策略限制 */
        unlock: function () {
            if (playing) return;
            if (!ctx && !buildContext()) return;
            if (ctx && ctx.state === "suspended") ctx.resume();
        },
        getState: function () {
            return {
                playing: playing,
                ctxState: ctx ? ctx.state : "uncreated",
                step: step16,
                masterGain: ctx ? master.gain.value : 0
            };
        }
    };

    var STORE_KEY = "xijie-music-on";
    var BPM = 70;
    var SPB = 60 / BPM;            // 每拍秒数

    var ctx = null, master, comp, dry, wet, convolver;
    var droneNodes = [];
    var playing = false;
    var timer = null, step16 = 0, nextTime = 0;

    /* ---------- 工具 ---------- */
    function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function storeGet() {
        try { return localStorage.getItem(STORE_KEY) === "1"; } catch (e) { return false; }
    }
    function storeSet(v) {
        try { localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch (e) {}
    }

    /* ---------- 音频环境 ---------- */
    function buildContext() {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();

        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 3.5;
        comp.attack.value = 0.006;
        comp.release.value = 0.22;
        comp.connect(ctx.destination);

        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(comp);

        dry = ctx.createGain(); dry.gain.value = 0.9; dry.connect(master);
        wet = ctx.createGain(); wet.gain.value = 0.32;
        convolver = ctx.createConvolver();
        convolver.buffer = makeImpulse(2.8, 2.6);
        wet.connect(convolver); convolver.connect(master);
        return true;
    }

    /* 合成混响脉冲：指数衰减噪声 */
    function makeImpulse(seconds, decay) {
        var rate = ctx.sampleRate, len = Math.floor(rate * seconds);
        var buf = ctx.createBuffer(2, len, rate);
        for (var c = 0; c < 2; c++) {
            var d = buf.getChannelData(c);
            for (var i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    /* ---------- 乐器 ---------- */

    /* 古筝式拨弦：三角波基音 + 高次谐波 + 拨弦噪声，指数衰减 */
    function guzheng(m, t, vel, dur) {
        var f = freq(m);
        var g = ctx.createGain();
        var lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(Math.min(f * 6, 5200), t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 700), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        lp.connect(g);

        var parts = [[1, 0.5, "triangle"], [2, 0.16], [3, 0.07], [4.27, 0.03]];
        parts.forEach(function (p, idx) {
            var o = ctx.createOscillator();
            var og = ctx.createGain();
            o.type = idx === 2 ? "sine" : p[2] || "sine";
            o.frequency.value = f * p[0];
            og.gain.value = p[1];
            o.connect(og); og.connect(lp);
            o.start(t); o.stop(t + dur + 0.05);
        });
        // 拨弦瞬态噪声
        var nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
        var nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
        var ns = ctx.createBufferSource(); ns.buffer = nb;
        var nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = f * 2.2; nf.Q.value = 1.2;
        var ng = ctx.createGain(); ng.gain.value = vel * 0.5;
        ns.connect(nf); nf.connect(ng); ng.connect(lp);
        ns.start(t);

        var send = ctx.createGain(); send.gain.value = 0.55;
        g.connect(dry); g.connect(send); send.connect(wet);
    }

    /* 低音托底：厚而软的拨弦 */
    function bass(m, t, vel) {
        var f = freq(m);
        var o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        var o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
        var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 480;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        var g2 = ctx.createGain(); g2.gain.value = 0.25;
        o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
        g.connect(dry);
        var send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(wet);
        o.start(t); o2.start(t); o.stop(t + 2.5); o2.stop(t + 2.5);
    }

    /* 竹笛：三角波 + 轻微气息噪声 + 延迟出现的颤音 */
    function dizi(m, t, vel, beats) {
        var f = freq(m);
        var dur = beats * SPB;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.09);                 // 吹管起音
        g.gain.setValueAtTime(vel, t + Math.max(0.12, dur - 0.16));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);  // 句尾留白换气

        var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;

        var o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        var o2 = ctx.createOscillator(); o2.type = "sine";
        o2.frequency.value = f; o2.detune.value = 5;

        var vib = ctx.createOscillator(); vib.type = "sine"; vib.frequency.value = 5.6;
        var vibG = ctx.createGain();
        vibG.gain.setValueAtTime(0, t);
        vibG.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur * 0.6));
        vibG.gain.setValueAtTime(f * 0.006, t + Math.max(0.12, dur - 0.2));
        vibG.gain.linearRampToValueAtTime(0, t + dur + 0.03);
        vib.connect(vibG);
        vibG.connect(o.frequency); vibG.connect(o2.frequency);

        // 气息
        var nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        var nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.5;
        var ns = ctx.createBufferSource(); ns.buffer = nb;
        var nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = f * 1.6; nf.Q.value = 0.6;
        var ng = ctx.createGain(); ng.gain.value = 0.05;

        o.connect(g); o2.connect(g); g.connect(lp);
        ns.connect(nf); nf.connect(ng); ng.connect(lp);
        lp.connect(dry);
        var send = ctx.createGain(); send.gain.value = 0.7; lp.connect(send); send.connect(wet);

        [o, o2, vib, ns].forEach(function (n) { n.start(t); n.stop(t + dur + 0.1); });
    }

    /* 碰铃：高频 FM 金属音，悠长延音 */
    function bell(t, vel) {
        var f = freq(86);   // D6
        var car = ctx.createOscillator(); car.type = "sine"; car.frequency.value = f;
        var mod = ctx.createOscillator(); mod.type = "sine"; mod.frequency.value = f * 2.76;
        var mg = ctx.createGain(); mg.gain.value = f * 0.6;
        mod.connect(mg); mg.connect(car.frequency);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        car.connect(g);
        g.connect(dry);
        var send = ctx.createGain(); send.gain.value = 1.4; g.connect(send); send.connect(wet);
        car.start(t); mod.start(t); car.stop(t + 2.3); mod.stop(t + 2.3);
    }

    /* 木鱼：短促的木质敲击 */
    function woodfish(t, vel) {
        var nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
        var nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
        var ns = ctx.createBufferSource(); ns.buffer = nb;
        var nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 7;
        var ng = ctx.createGain();
        ng.gain.setValueAtTime(vel, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        ns.connect(nf); nf.connect(ng); ng.connect(dry);
        var send = ctx.createGain(); send.gain.value = 0.25; ng.connect(send); send.connect(wet);
        ns.start(t);
    }

    /* 堂鼓轻击（段落起始） */
    function drum(t, vel) {
        var o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.22);
        var g = ctx.createGain();
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        o.connect(g); g.connect(dry);
        var send = ctx.createGain(); send.gain.value = 0.35; g.connect(send); send.connect(wet);
        o.start(t); o.stop(t + 0.5);
    }

    /* 氛围长音：宫（D）、徵（A）两支微失谐三角波缓慢呼吸 */
    function startDrone() {
        stopDrone();
        [50, 57].forEach(function (m, i) {
            var o = ctx.createOscillator(); o.type = "triangle";
            o.frequency.value = freq(m); o.detune.value = i ? 5 : -5;
            var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 650;
            var g = ctx.createGain(); g.gain.value = 0;
            g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 3);
            var lfo = ctx.createOscillator(); lfo.type = "sine";
            lfo.frequency.value = i ? 0.07 : 0.05;
            var lg = ctx.createGain(); lg.gain.value = 0.012;
            lfo.connect(lg); lg.connect(g.gain);
            o.connect(lp); lp.connect(g); g.connect(master);
            o.start(); lfo.start();
            droneNodes.push(o, lfo);
        });
    }
    function stopDrone() {
        droneNodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
        droneNodes = [];
    }

    /* ---------- 曲谱 ---------- */

    /* 竹笛旋律：[MIDI音高, 拍数]；null 表示休止。两段 8 小节交替，避免重复疲劳 */
    var MELODY_A = [
        [74, 1], [76, .5], [74, .5], [71, 2],          // D5 E5 D5 B4
        [69, 1.5], [66, .5], [64, 2],                  // A4 F#4 E4
        [74, 1], [76, 1], [78, 1.5], [76, .5],         // D5 E5 F#5 E5
        [74, 2], [71, 2],                              // D5 B4
        [69, 1], [71, 1], [74, 2],                     // A4 B4 D5
        [76, 1.5], [74, .5], [71, 2],                  // E5 D5 B4
        [69, 1], [66, 1], [64, 1], [66, 1],            // A4 F#4 E4 F#4
        [74, 3], [null, 1]                             // D5 长音收尾
    ];
    var MELODY_B = [
        [78, 1], [76, .5], [74, .5], [76, 2],          // F#5 E5 D5 E5
        [74, 1.5], [71, .5], [69, 2],
        [71, 1], [69, 1], [66, 2],
        [64, 2], [62, 2],                              // E4 D4
        [74, 1], [78, 1], [76, 2],
        [74, 1.5], [71, .5], [69, 2],
        [71, 1], [69, 1], [76, 1], [74, 1],
        [74, 3], [null, 1]
    ];

    /* 每小节：低音根音 + 古筝琶音的四个可用音（五声正音，无偏音） */
    var CHORDS_A = [
        { bass: 38, tones: [50, 57, 62, 64] },  // 宫 D
        { bass: 33, tones: [45, 52, 57, 59] },  // 徵 A
        { bass: 35, tones: [47, 54, 59, 64] },  // 羽 B
        { bass: 42, tones: [54, 57, 66, 69] },  // 角 F#
        { bass: 35, tones: [47, 54, 59, 66] },
        { bass: 33, tones: [45, 52, 57, 64] },
        { bass: 38, tones: [50, 57, 64, 66] },
        { bass: 33, tones: [45, 57, 64, 69] }
    ];
    var CHORDS_B = [
        { bass: 50, tones: [62, 69, 74, 76] },
        { bass: 45, tones: [57, 64, 69, 71] },
        { bass: 47, tones: [59, 66, 71, 76] },
        { bass: 54, tones: [66, 69, 71, 78] },
        { bass: 47, tones: [59, 66, 71, 78] },
        { bass: 45, tones: [57, 64, 71, 76] },
        { bass: 50, tones: [62, 69, 76, 78] },
        { bass: 45, tones: [57, 69, 76, 81] }
    ];
    /* 八分音符的拨弦指法，每小节循环不同形态 */
    var ARPS = [
        [0, 2, 1, 3, 2, 3, 1, 2],
        [3, 2, 1, 2, 0, 2, 3, 2],
        [0, 1, 2, 3, 2, 1, 2, 3]
    ];

    /* 把旋律展开为以 16 分音符为网格的事件 */
    function flatten(melody) {
        var events = [], pos = 0;
        melody.forEach(function (n) {
            if (n[0] !== null) events.push({ at: pos, m: n[0], d: n[1] });
            pos += Math.round(n[1] * 4);
        });
        return events;
    }
    var MELODY_A_EV = flatten(MELODY_A);
    var MELODY_B_EV = flatten(MELODY_B);

    /* ---------- 调度 ---------- */
    function scheduleStep(s, t) {
        var bar32 = Math.floor(s / 16);
        var bar = bar32 % 8;
        var section = Math.floor(bar32 / 8) % 2;
        var inBar = s % 16;
        var chords = section ? CHORDS_B : CHORDS_A;
        var ch = chords[bar];

        /* 低音：每小节第一拍 */
        if (inBar === 0) {
            bass(ch.bass, t, rand(0.12, 0.17));
            if (bar === 0) drum(t, 0.10);                 // 段落起始一声堂鼓
            if (bar % 2 === 0) bell(t, rand(0.04, 0.07)); // 碰铃隔小节一点
        }
        /* 木鱼：每小节第二拍，像老街更夫的板眼 */
        if (inBar === 8) woodfish(t, rand(0.05, 0.08));

        /* 古筝：八分音符拨弦，力度随拍位起伏 */
        if (inBar % 2 === 0) {
            var k = inBar / 2;
            var pattern = ARPS[bar % ARPS.length];
            if (!(k === 7 && Math.random() < 0.18)) {     // 偶尔句末留空
                var m = ch.tones[pattern[k]];
                var vel = (k === 0 ? 0.17 : 0.10) * rand(0.8, 1.15);
                guzheng(m, t, vel, rand(1.1, 1.7));
                // 偶尔在高音区补一声泛音
                if (k === 6 && Math.random() < 0.3) {
                    guzheng(m + 12, t + SPB / 2, 0.07, 1.2);
                }
            }
        }

        /* 竹笛主旋律 */
        var events = section ? MELODY_B_EV : MELODY_A_EV;
        var sectionStart = section ? 128 : 0;
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.at === s - sectionStart) {
                dizi(ev.m, t + rand(-0.012, 0.012), rand(0.13, 0.18), ev.d * 0.96);
                break;
            }
        }
    }

    function schedulerLoop() {
        while (nextTime < ctx.currentTime + 0.16) {
            scheduleStep(step16, nextTime);
            nextTime += SPB / 4;
            step16++;
        }
    }

    /* ---------- 播放控制 ---------- */
    function start() {
        if (playing) return;
        if (!ctx && !buildContext()) return;
        playing = true;
        step16 = 0;
        nextTime = ctx.currentTime + 0.12;
        if (ctx.state === "suspended") {
            ctx.resume().then(function () {
                if (playing) { step16 = 0; nextTime = ctx.currentTime + 0.15; }
            });
        }
        startDrone();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 1.6);
        if (timer) clearInterval(timer);
        timer = setInterval(schedulerLoop, 30);
        setBtn(true);
        storeSet(true);
        broadcastState(true);
    }

    function stop() {
        if (!playing) return;
        playing = false;
        if (timer) { clearInterval(timer); timer = null; }
        if (ctx) {
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
            master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
            var c = ctx;
            setTimeout(function () { stopDrone(); if (c.state === "running") c.suspend(); }, 700);
        }
        setBtn(false);
        storeSet(false);
        broadcastState(false);
    }

    /* ---------- 公共 UI：样式 + 悬浮开关 ---------- */
    var btn;
    function setBtn(on) {
        if (!btn) return;
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.title = on ? "关闭背景音乐" : "播放背景音乐";
    }
    /* 顶层把播放状态同步给所有子页面 iframe */
    function broadcastState(on) {
        var frames = document.querySelectorAll("iframe");
        for (var i = 0; i < frames.length; i++) {
            try { frames[i].contentWindow.postMessage({ type: "xijie-music-state", on: on }, "*"); } catch (e) {}
        }
    }
    function createMusicButton(onClick) {
        var css =
            ".xj-music{position:fixed;right:18px;z-index:9999;display:inline-flex;align-items:center;gap:7px;" +
            "height:40px;padding:0 15px;border-radius:20px;font-family:KaiTi,'楷体',serif;font-size:16px;" +
            "letter-spacing:.1em;color:#a83a2b;background:rgba(247,241,230,.94);border:1px solid rgba(125,97,71,.55);" +
            "box-shadow:0 6px 18px rgba(16,12,8,.22);cursor:pointer;backdrop-filter:blur(4px);" +
            "-webkit-backdrop-filter:blur(4px);transition:transform .25s ease,background .25s ease,border-color .25s ease;}" +
            ".xj-music:hover{transform:translateY(-2px);background:#ede2cd;border-color:#43505a;}" +
            ".xj-music:active{transform:translateY(0);}" +
            ".xj-note{font-size:17px;line-height:1;}" +
            ".xj-eq{display:none;gap:2px;height:13px;align-items:flex-end;}" +
            ".xj-eq i{width:3px;height:30%;background:#a83a2b;border-radius:1px;animation:xjEq .9s ease-in-out infinite;}" +
            ".xj-eq i:nth-child(2){animation-delay:.18s}" +
            ".xj-eq i:nth-child(3){animation-delay:.36s}" +
            "@keyframes xjEq{0%,100%{height:25%}50%{height:100%}}" +
            ".xj-music.on .xj-note{display:none;}" +
            ".xj-music.on .xj-eq{display:inline-flex;}" +
            "@media (max-width:640px){.xj-music{right:12px;height:36px;padding:0 12px;font-size:14px;}}" +
            "@media (prefers-reduced-motion:reduce){.xj-eq i{animation:none;height:80%}}";
        var styleEl = document.createElement("style");
        styleEl.textContent = css;
        document.head.appendChild(styleEl);

        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "xj-music";
        btn.setAttribute("aria-label", "背景音乐开关");
        btn.innerHTML =
            '<span class="xj-note">♪</span>' +
            '<span class="xj-eq"><i></i><i></i><i></i></span>' +
            '<span class="xj-txt">乐</span>';
        // 子页面底部有控制栏时，开关上移避让
        btn.style.bottom = document.querySelector(".controls") ? "92px" : "18px";
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            onClick();
        });
        function attach() { if (document.body && !btn.parentNode) document.body.appendChild(btn); }
        document.addEventListener("DOMContentLoaded", attach);
        attach();
    }

    /* 是否运行在 iframe 中：子页面只保留开关 UI，音频始终由顶层单实例播放，
       这样首页↔子页面如何切换，音乐都不会中断 */
    var inFrame = (function () {
        try { return window.self !== window.top; } catch (e) { return true; }
    })();

    if (inFrame) {
        createMusicButton(function () {
            try { window.top.postMessage({ type: "xijie-music-toggle" }, "*"); } catch (e) {}
        });
        setBtn(storeGet());
        window.addEventListener("message", function (e) {
            var d = e.data;
            if (d && d.type === "xijie-music-state") setBtn(!!d.on);
        });
        return; // 子模式到此为止，不创建任何音频节点
    }

    /* ===== 顶层完整模式 ===== */
    createMusicButton(function () { playing ? stop() : start(); });

    // 接收子页面 iframe 内的开关指令（音频实例始终留在顶层，不中断）
    window.addEventListener("message", function (e) {
        var d = e.data;
        if (!d || d.type !== "xijie-music-toggle") return;
        if (playing) stop(); else start();
    });

    /* 上次离开页面时音乐是开着的：在本次第一次手势后自动续播（浏览器自动播放策略要求） */
    if (storeGet()) {
        var kick = function (e) {
            // 点音乐按钮本身时交给按钮自己的点击逻辑，避免一开一关相互抵消
            if (e && e.target && e.target.closest && e.target.closest(".xj-music")) return;
            start();
        };
        document.addEventListener("pointerdown", kick, { once: true });
        document.addEventListener("keydown", kick, { once: true });
        setBtn(true);
        btn.title = "点击任意处继续播放背景音乐";
    } else {
        setBtn(false);
    }
})();
