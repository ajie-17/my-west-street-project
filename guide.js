/* ============================================================
 * 小食老师 · 对话引导引擎（group1 / group2 共用）
 * 纯静态、零依赖；样式运行时注入；两帧立绘张闭嘴切换
 * 用法：
 *   var guide = XJGuide({ name, idle, talk });
 *   guide.bind([ {id, say, onShow, opts:[{label, goto, run}]}, ... ]);
 *   guide.show(id);        // 显示某节点（打字机逐字）
 *   guide.dismiss();       // 收起为“唤回”小圆钮（标记 muted，不再主动弹窗）
 *   guide.hideBubble();    // 临时藏气泡（如灯箱打开）
 *   guide.restoreBubble(); // 灯箱关闭后恢复当前节点气泡
 *   guide.isMuted();       // 学生是否选择了“自己看”
 * ============================================================ */
(function () {
    "use strict";

    var CSS = [
        ".xj-g{position:fixed;right:16px;bottom:94px;z-index:90;display:flex;align-items:flex-end;gap:8px;",
        "transition:opacity .3s ease,transform .3s ease;pointer-events:auto;}",
        ".xj-g.away{opacity:0;transform:translateY(24px);pointer-events:none;}",
        ".xj-g-bubble{position:relative;width:min(306px,60vw);margin-bottom:30px;",
        "background:#f7f1e6;border:1px solid rgba(125,97,71,.55);border-radius:14px;",
        "padding:13px 15px 12px;box-shadow:0 14px 36px rgba(20,12,6,.3);}",
        ".xj-g-bubble::after{content:'';position:absolute;right:-9px;bottom:26px;",
        "border:9px solid transparent;border-left-color:rgba(125,97,71,.55);}",
        ".xj-g-bubble::before{content:'';position:absolute;right:-7px;bottom:27px;z-index:1;",
        "border:8px solid transparent;border-left-color:#f7f1e6;}",
        ".xj-g-bubble.is-hidden{display:none;}",
        ".xj-g-name{font-family:'KaiTi','楷体',serif;font-size:14px;letter-spacing:.14em;",
        "color:#a83a2b;margin-bottom:3px;}",
        ".xj-g-say{font-family:'SimSun','宋体',serif;font-size:15px;line-height:1.85;",
        "letter-spacing:.02em;color:#382c1c;min-height:1.6em;cursor:pointer;}",
        ".xj-g-say.xj-g-typing::after{content:'▍';color:#a83a2b;-webkit-animation:xjgBlink 1s steps(1) infinite;animation:xjgBlink 1s steps(1) infinite;}",
        "@keyframes xjgBlink{50%{opacity:0;}}",
        ".xj-g-close{position:absolute;top:5px;right:8px;width:22px;height:22px;border:0;",
        "background:transparent;color:#9a8a72;font-size:15px;line-height:1;cursor:pointer;border-radius:50%;}",
        ".xj-g-close:hover{color:#a83a2b;background:rgba(168,58,43,.1);}",
        ".xj-g-opts{display:flex;flex-direction:column;gap:7px;margin-top:10px;}",
        ".xj-g-opts:empty{display:none;}",
        ".xj-g-opts.xj-g-typing .xj-g-opt{opacity:.55;}",
        ".xj-g-opt{text-align:left;padding:8px 12px;font-family:'KaiTi','楷体',serif;",
        "font-size:14.5px;letter-spacing:.04em;color:#7a2f21;cursor:pointer;",
        "background:rgba(168,58,43,.07);border:1px solid rgba(168,58,43,.5);border-radius:9px;",
        "transition:background-color .18s ease,color .18s ease,transform .15s ease;}",
        ".xj-g-opt:hover{background:#a83a2b;color:#f7f1e6;transform:translateX(-2px);}",
        ".xj-g-opt:active{transform:translateX(0);}",
        ".xj-g-fig{position:relative;width:128px;flex:0 0 auto;-webkit-animation:xjgBob 3.4s ease-in-out infinite;animation:xjgBob 3.4s ease-in-out infinite;}",
        "@keyframes xjgBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}",
        ".xj-g-fig img{width:128px;display:block;filter:drop-shadow(0 10px 16px rgba(20,12,6,.38));}",
        ".xj-g-talk{position:absolute;inset:0;opacity:0;transition:opacity .15s ease;}",
        ".xj-g.speaking .xj-g-talk{opacity:1;}",
        ".xj-g.speaking .xj-g-idle{opacity:0;}",
        ".xj-g-idle{transition:opacity .15s ease;}",
        ".xj-g-recall{position:fixed;right:18px;bottom:100px;z-index:90;display:none;",
        "align-items:center;gap:8px;padding:7px 14px 7px 8px;border-radius:40px;",
        "font-family:'KaiTi','楷体',serif;font-size:14.5px;letter-spacing:.08em;color:#f7f1e6;",
        "background:rgba(52,38,20,.92);border:1px solid rgba(217,167,79,.6);cursor:pointer;",
        "box-shadow:0 8px 24px rgba(20,12,6,.4);transition:transform .2s ease;}",
        ".xj-g-recall:hover{transform:translateY(-2px);}",
        ".xj-g-recall.show{display:inline-flex;}",
        ".xj-g-recall img{width:38px;height:38px;border-radius:50%;object-fit:contain;background:#f7f1e6;}",
        ".xj-g-recall .xj-g-dot{position:absolute;top:7px;left:30px;width:9px;height:9px;border-radius:50%;",
        "background:#d4622a;box-shadow:0 0 8px rgba(212,98,42,.9);-webkit-animation:xjgPulse 1.6s ease-in-out infinite;animation:xjgPulse 1.6s ease-in-out infinite;}",
        "@keyframes xjgPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.45);opacity:.55;}}",
        "@media (max-width:760px){",
        ".xj-g{right:8px;bottom:90px;gap:6px;}",
        ".xj-g-bubble{width:calc(100vw - 118px);margin-bottom:18px;padding:10px 11px 9px;}",
        ".xj-g-say{font-size:13.5px;line-height:1.75;}",
        ".xj-g-opt{font-size:13px;padding:7px 10px;}",
        ".xj-g-fig,.xj-g-fig img{width:86px;}",
        ".xj-g-recall{bottom:96px;}",
        "}",
        "@media (prefers-reduced-motion:reduce){",
        ".xj-g-fig{animation:none;}",
        ".xj-g-recall .xj-g-dot{animation:none;}",
        "}"
    ].join("");

    function mount(cfg) {
        var style = document.createElement("style");
        style.textContent = CSS;
        document.head.appendChild(style);

        var dock = document.createElement("div");
        dock.className = "xj-g";
        dock.innerHTML =
            '<div class="xj-g-bubble">' +
                '<button class="xj-g-close" title="先自己看" aria-label="收起老师讲解">×</button>' +
                '<div class="xj-g-name"></div>' +
                '<div class="xj-g-say"></div>' +
                '<div class="xj-g-opts"></div>' +
            "</div>" +
            '<div class="xj-g-fig">' +
                '<img class="xj-g-idle" alt="">' +
                '<img class="xj-g-talk" alt="">' +
            "</div>";
        document.body.appendChild(dock);

        var recall = document.createElement("button");
        recall.className = "xj-g-recall";
        recall.innerHTML = '<img alt=""><span class="xj-g-dot"></span><span>问小食老师</span>';
        document.body.appendChild(recall);

        // 预载立绘，避免首次张嘴时闪白
        [cfg.idle, cfg.talk].forEach(function (src) {
            var im = new Image(); im.src = src;
        });
        dock.querySelector(".xj-g-idle").src = cfg.idle;
        dock.querySelector(".xj-g-talk").src = cfg.talk;
        recall.querySelector("img").src = cfg.idle;
        dock.querySelector(".xj-g-name").textContent = cfg.name || "小食老师";
        return { dock: dock, recall: recall };
    }

    window.XJGuide = function (cfg) {
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var ui = mount(cfg);
        var dock = ui.dock, recall = ui.recall;
        var bubble = dock.querySelector(".xj-g-bubble");
        var sayEl = dock.querySelector(".xj-g-say");
        var optsEl = dock.querySelector(".xj-g-opts");

        var nodes = [], byId = {}, order = {};
        var cur = null;
        var muted = false;
        var typeTimer = null;
        var mouthTimer = null;
        var typing = false;
        var pendingFull = "";

        function clearTimers() {
            if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
            if (mouthTimer) { clearTimeout(mouthTimer); mouthTimer = null; }
        }
        function speakOn() {
            dock.classList.add("speaking");
            if (mouthTimer) clearTimeout(mouthTimer);
        }
        function speakOffSoon() {
            if (mouthTimer) clearTimeout(mouthTimer);
            mouthTimer = setTimeout(function () { dock.classList.remove("speaking"); }, 500);
        }

        function renderOpts() {
            optsEl.innerHTML = "";
            var opts = (cur && cur.opts) || [];
            opts.forEach(function (o) {
                var b = document.createElement("button");
                b.className = "xj-g-opt";
                b.textContent = o.label;
                b.addEventListener("click", function () {
                    /* 打字途中点选项：先快进全文，本选项立即生效 */
                    if (typing) finishType();
                    if (o.run) { try { o.run(); } catch (e) {} }
                    if (o.goto) api.show(o.goto);
                });
                optsEl.appendChild(b);
            });
        }

        function typeOut(text) {
            pendingFull = text;
            typing = true;
            sayEl.classList.add("xj-g-typing");
            optsEl.classList.add("xj-g-typing");
            if (reduced) { finishType(); return; }
            var i = 0;
            (function step() {
                i++;
                sayEl.textContent = text.slice(0, i);
                if (i < text.length) {
                    var ch = text.charAt(i - 1);
                    var pause = "，。！？、；：…—".indexOf(ch) !== -1 ? 95 : 26;
                    typeTimer = setTimeout(step, pause);
                } else {
                    finishType();
                }
            })();
        }
        function finishType() {
            if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
            if (cur) sayEl.textContent = pendingFull;
            typing = false;
            sayEl.classList.remove("xj-g-typing");
            optsEl.classList.remove("xj-g-typing");
            speakOffSoon();
        }
        // 打字中点击文字：立即补全
        sayEl.addEventListener("click", function () {
            if (typing) finishType();
        });

        dock.querySelector(".xj-g-close").addEventListener("click", function () {
            api.dismiss();
        });
        recall.addEventListener("click", function () {
            muted = false;
            recall.classList.remove("show");
            dock.classList.remove("away");
            bubble.classList.remove("is-hidden");
            if (cur) api.show(cur.id);
        });

        var api = {
            bind: function (arr) {
                nodes = arr;
                byId = {};
                order = {};
                arr.forEach(function (n, i) { byId[n.id] = n; order[n.id] = i; });
            },
            show: function (id) {
                var n = byId[id];
                if (!n) return;
                cur = n;
                muted = false;
                clearTimers();
                recall.classList.remove("show");
                dock.classList.remove("away");
                bubble.classList.remove("is-hidden");
                speakOn();
                sayEl.textContent = "";
                renderOpts();
                if (n.onShow) { try { n.onShow(); } catch (e) {} }
                typeOut(n.say || "");
            },
            dismiss: function () {
                muted = true;
                clearTimers();
                dock.classList.add("away");
                setTimeout(function () { recall.classList.add("show"); }, 180);
            },
            hideBubble: function () {
                bubble.classList.add("is-hidden");
            },
            restoreBubble: function () {
                if (!muted) bubble.classList.remove("is-hidden");
            },
            isMuted: function () { return muted; },
            current: function () { return cur && cur.id; }
        };
        return api;
    };
})();
