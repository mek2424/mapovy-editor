/*! @dayflow/blossom-color-picker 2.3.0 | MIT License | (c) 2026 Jayce Li | https://github.com/dayflow-js/BlossomColorPicker */
//#region src/adaptive.ts
function e({ elementRect: e, containerSize: t, currentShiftOffset: n, windowWidth: r, windowHeight: i, sliderPosition: a, adaptivePositioning: o, circularBarWidth: s, sliderOffset: c }) {
	let l = t / 2, u = e.left + e.width / 2 - n.x, d = e.top + e.height / 2 - n.y, f = 0, p = 0;
	o && (u + l > r - 10 ? f = r - 10 - (u + l) : u - l < 10 && (f = 10 - (u - l)), d + l > i - 10 ? p = i - 10 - (d + l) : d - l < 10 && (p = 10 - (d - l)));
	let m = a || "right";
	if (!a) {
		let e = r - (u + f + l), t = u + f - l, n = d + p - l, a = i - (d + p + l), o = c + s + 20;
		m = e < o && t > e ? "left" : t < o && e > t ? "right" : a < o && n > a ? "top" : n < o && a > n ? "bottom" : "right";
	}
	return {
		effectivePosition: m,
		shiftOffset: {
			x: f,
			y: p
		}
	};
}
//#endregion
//#region src/constants.ts
var t = [
	{
		h: 47,
		s: 97,
		l: 65
	},
	{
		h: 37,
		s: 98,
		l: 65
	},
	{
		h: 27,
		s: 95,
		l: 64
	},
	{
		h: 14,
		s: 90,
		l: 64
	},
	{
		h: 0,
		s: 85,
		l: 64
	},
	{
		h: 327,
		s: 75,
		l: 62
	},
	{
		h: 285,
		s: 51,
		l: 59
	},
	{
		h: 257,
		s: 65,
		l: 64
	},
	{
		h: 225,
		s: 71,
		l: 65
	},
	{
		h: 202,
		s: 68,
		l: 65
	},
	{
		h: 151,
		s: 43,
		l: 63
	},
	{
		h: 96,
		s: 49,
		l: 67
	}
], n = [
	{
		h: 50,
		s: 95,
		l: 85
	},
	{
		h: 26,
		s: 89,
		l: 89
	},
	{
		h: 345,
		s: 77,
		l: 88
	},
	{
		h: 283,
		s: 47,
		l: 84
	},
	{
		h: 209,
		s: 70,
		l: 87
	},
	{
		h: 116,
		s: 42,
		l: 87
	}
], r = [...n, ...t], i = "linear(0, 0.060 3%, 0.200 7%, 0.420 13%, 0.680 20%, 0.900 28%, 1.020 35%, 1.060 45%, 1.025 53%, 0.997 62%, 1.0 68%)", a = "http://www.w3.org/2000/svg";
function o(e, t, n) {
	let r = document.createElement(e);
	if (t && c(r, t), n) for (let [e, t] of Object.entries(n)) r.setAttribute(e, t);
	return r;
}
function s(e, t) {
	let n = document.createElementNS(a, e);
	if (t) for (let [e, r] of Object.entries(t)) n.setAttribute(e, r);
	return n;
}
function c(e, t) {
	for (let [n, r] of Object.entries(t)) r !== void 0 && (e.style[n] = r);
}
function l(e, t) {
	for (let [n, r] of Object.entries(t)) e.setAttribute(n, r);
}
//#endregion
//#region src/layout.ts
function u(e, t, n) {
	let r = [], i = n, a = t / 2, o = n / 2;
	for (let t = 0; t < e.length; t++) {
		let n = e[t].length, s = n <= 8 ? .45 : n <= 12 ? .5 : .55, c = n * i * s / (2 * Math.PI), l;
		if (t === 0) {
			let e = n <= 5 ? i * .35 : i * .25, t = a + o - e;
			l = Math.max(t, c);
		} else {
			let n = r[t - 1], a = e[t - 1].length, o = 2 * Math.PI * n, s = a * i / o, u = i * .35;
			s < .85 ? u = i * .15 : s > 1.1 && (u = i * .45);
			let d = n + u;
			l = Math.max(d, c), l = Math.max(l, n + i * .1);
		}
		r.push(l);
	}
	return r;
}
function d(e) {
	let t = [0];
	for (let n = 1; n < e.length; n++) {
		let r = 360 / e[n - 1].length / 2;
		t.push(r);
	}
	return t;
}
function f(e, t, n, r) {
	return e.length > 0 ? e[e.length - 1] + t / 2 + r : n / 2 + r;
}
function p(e, t, n, r, i) {
	let a = e + t / 2, o = n ? e + r + i / 2 : 0;
	return Math.max(a, o) * 2 + 4;
}
function m(e, t, n, r, i, a = !1, o = !1) {
	let s = (i - r) * 100, c = n + 10;
	return e === t ? o ? s + c : s : s + (e - t + n) % n;
}
//#endregion
//#region src/arc-geometry.ts
function h(e, t, n, r) {
	let i = r * Math.PI / 180;
	return {
		x: e + n * Math.cos(i),
		y: t + n * Math.sin(i)
	};
}
function g(e, t, n, r, i) {
	let a = h(e, t, n, r), o = h(e, t, n, i), s = Math.abs(i - r) > 180 ? "1" : "0";
	return `M ${a.x} ${a.y} A ${n} ${n} 0 ${s} 1 ${o.x} ${o.y}`;
}
function _(e) {
	switch (e) {
		case "top": return -90;
		case "bottom": return 90;
		case "left": return 180;
		default: return 0;
	}
}
function v(e, t, n, r, i) {
	let a = 180 / Math.PI * Math.atan2(t, e) - n;
	for (; a > 180;) a -= 360;
	for (; a < -180;) a += 360;
	a = Math.max(-r, Math.min(r, a));
	let o;
	return o = i === "left" ? (r - a) / (2 * r) * 100 : (a + r) / (2 * r) * 100, Math.round(Math.max(0, Math.min(100, o)));
}
function y(e, t, n, r, i) {
	return Array.from({ length: n }, (a, o) => {
		let s = o / (n - 1);
		return i(e, r(s * 100, t), 100 - s * 80);
	});
}
//#endregion
//#region src/utils.ts
function b(e) {
	return (100 - Math.max(20, Math.min(100, e))) / 80 * 100;
}
function x(e) {
	return 100 - e / 100 * 80;
}
function S(e) {
	e = e.replace(/^#/, "");
	let t = parseInt(e.slice(0, 2), 16) / 255, n = parseInt(e.slice(2, 4), 16) / 255, r = parseInt(e.slice(4, 6), 16) / 255, i = Math.max(t, n, r), a = Math.min(t, n, r), o = (i + a) / 2;
	if (i === a) return {
		h: 0,
		s: 0,
		l: Math.round(o * 100)
	};
	let s = i - a, c = o > .5 ? s / (2 - i - a) : s / (i + a), l = 0;
	switch (i) {
		case t:
			l = ((n - r) / s + (n < r ? 6 : 0)) / 6;
			break;
		case n:
			l = ((r - t) / s + 2) / 6;
			break;
		case r: l = ((t - n) / s + 4) / 6;
	}
	return {
		h: Math.round(l * 360),
		s: Math.round(c * 100),
		l: Math.round(o * 100)
	};
}
function C(e, t, n) {
	e /= 255, t /= 255, n /= 255;
	let r = Math.max(e, t, n), i = Math.min(e, t, n), a = (r + i) / 2;
	if (r === i) return {
		h: 0,
		s: 0,
		l: Math.round(a * 100)
	};
	let o = r - i, s = a > .5 ? o / (2 - r - i) : o / (r + i), c = 0;
	switch (r) {
		case e:
			c = ((t - n) / o + (t < n ? 6 : 0)) / 6;
			break;
		case t:
			c = ((n - e) / o + 2) / 6;
			break;
		case n: c = ((e - t) / o + 4) / 6;
	}
	return {
		h: Math.round(c * 360),
		s: Math.round(s * 100),
		l: Math.round(a * 100)
	};
}
function w(e) {
	if (typeof e == "object") return e;
	let t = e.trim().toLowerCase();
	if (t.startsWith("#")) return S(t);
	let n = t.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/);
	if (n) return {
		h: Math.round(parseFloat(n[1])),
		s: Math.round(parseFloat(n[2])),
		l: Math.round(parseFloat(n[3]))
	};
	let r = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
	return r ? C(parseFloat(r[1]), parseFloat(r[2]), parseFloat(r[3])) : {
		h: 0,
		s: 0,
		l: 50
	};
}
function T(e, t, n) {
	let r = t / 100, i = n / 100, a = (1 - Math.abs(2 * i - 1)) * r, o = a * (1 - Math.abs(e / 60 % 2 - 1)), s = i - a / 2, c = 0, l = 0, u = 0;
	e >= 0 && e < 60 ? (c = a, l = o, u = 0) : e >= 60 && e < 120 ? (c = o, l = a, u = 0) : e >= 120 && e < 180 ? (c = 0, l = a, u = o) : e >= 180 && e < 240 ? (c = 0, l = o, u = a) : e >= 240 && e < 300 ? (c = o, l = 0, u = a) : (c = a, l = 0, u = o);
	let d = (e) => {
		let t = Math.round((e + s) * 255).toString(16);
		return t.length === 1 ? "0" + t : t;
	};
	return `#${d(c)}${d(l)}${d(u)}`;
}
function E(e, t) {
	return e < 10 ? e / 10 * t : t;
}
function D(e, t, n) {
	return `hsl(${Math.round(e)}, ${Math.round(t)}%, ${Math.round(n)}%)`;
}
function O(e, t, n, r) {
	return `hsla(${Math.round(e)}, ${Math.round(t)}%, ${Math.round(n)}%, ${(r / 100).toFixed(2)})`;
}
function k(e, t, n) {
	let r = t / 100, i = n / 100, a = (t) => (t + e / 30) % 12, o = r * Math.min(i, 1 - i), s = (e) => i - o * Math.max(-1, Math.min(a(e) - 3, Math.min(9 - a(e), 1)));
	return {
		r: Math.round(255 * s(0)),
		g: Math.round(255 * s(8)),
		b: Math.round(255 * s(4))
	};
}
function A(e, t, n, r) {
	return `rgba(${Math.round(e)}, ${Math.round(t)}, ${Math.round(n)}, ${(r / 100).toFixed(2)})`;
}
function j(e, t, n, r, i, a, o) {
	let { r: s, g: c, b: l } = k(e, n, i);
	return {
		hue: e,
		saturation: t,
		originalSaturation: r,
		lightness: i,
		alpha: a,
		layer: o,
		r: s,
		g: c,
		b: l,
		hex: T(e, n, i),
		hsl: D(e, n, i),
		hsla: O(e, n, i, a),
		rgb: `rgb(${s}, ${c}, ${l})`,
		rgba: A(s, c, l, a)
	};
}
function M(e) {
	if (!e || e.length === 0) return [];
	let t = e.toSorted((e, t) => t.l - e.l), n = t.length, r = [];
	if (n <= 10) r = [n];
	else if (n <= 24) {
		let e = Math.max(4, Math.floor(n * .35));
		r = [e, n - e];
	} else if (n <= 42) {
		let e = Math.max(5, Math.floor(n * .15)), t = Math.floor(n * .35);
		r = [
			e,
			t,
			n - e - t
		];
	} else {
		let e = Math.max(6, Math.floor(n * .1)), t = Math.floor(n * .2), i = Math.floor(n * .3);
		r = [
			e,
			t,
			i,
			n - e - t - i
		];
	}
	let i = [], a = 0;
	for (let e = 0; e < r.length; e++) {
		let n = r[e], o = t.slice(a, a + n);
		o.sort((e, t) => e.h - t.h), o.length > 0 && i.push(o), a += n;
	}
	return i;
}
//#endregion
//#region src/renderers/ArcSliderRenderer.ts
var N = 0, P = class {
	barWidth;
	onChange;
	el;
	bgPath;
	gradientPath;
	handle;
	gradient;
	gradientStops = [];
	isDragging = !1;
	svgSize;
	center;
	arcRadius;
	halfSweep = 30;
	handleRadius;
	gradientId;
	currentPosition;
	currentValue = 50;
	currentHue = 0;
	currentBaseSaturation = 70;
	animationDuration;
	boundMouseMove;
	boundTouchMove;
	boundEnd;
	constructor(e, t, n, r, i, a = "right") {
		this.barWidth = t, this.onChange = i, this.animationDuration = r, this.currentPosition = a, this.arcRadius = e + n, this.handleRadius = t / 2, this.svgSize = (this.arcRadius + this.handleRadius + this.barWidth) * 2 + 20, this.center = this.svgSize / 2, this.gradientId = `bcp-arc-grad-${++N}`, this.el = s("svg", {
			width: String(this.svgSize),
			height: String(this.svgSize)
		}), this.el.classList.add("bcp-svg"), c(this.el, {
			left: "50%",
			top: "50%",
			marginLeft: `${-this.svgSize / 2}px`,
			marginTop: `${-this.svgSize / 2}px`,
			zIndex: "50"
		});
		let o = s("defs");
		this.gradient = s("linearGradient", {
			id: this.gradientId,
			gradientUnits: "userSpaceOnUse"
		});
		for (let e = 0; e < 11; e++) {
			let t = s("stop", {
				offset: `${e / 10 * 100}%`,
				"stop-color": "#fff"
			});
			this.gradientStops.push(t), this.gradient.appendChild(t);
		}
		o.appendChild(this.gradient), this.el.appendChild(o), this.bgPath = s("path", {
			fill: "none",
			stroke: "rgba(0,0,0,0.06)",
			"stroke-width": String(this.barWidth),
			"stroke-linecap": "round"
		}), this.el.appendChild(this.bgPath), this.gradientPath = s("path", {
			fill: "none",
			stroke: `url(#${this.gradientId})`,
			"stroke-width": String(this.barWidth),
			"stroke-linecap": "round"
		}), this.gradientPath.classList.add("bcp-slider-track"), this.gradientPath.addEventListener("click", (e) => {
			this.handleTrackClick(e);
		}), this.el.appendChild(this.gradientPath), this.handle = s("circle", {
			r: String(this.handleRadius),
			fill: "#fff",
			stroke: "white",
			"stroke-width": "2"
		}), this.handle.classList.add("bcp-slider-handle"), this.handle.addEventListener("mousedown", (e) => {
			e.preventDefault(), this.startDrag();
		}), this.handle.addEventListener("touchstart", (e) => {
			e.preventDefault(), this.startDrag();
		}), this.el.appendChild(this.handle), this.boundMouseMove = (e) => this.calculateValueFromEvent(e), this.boundTouchMove = (e) => this.calculateValueFromEvent(e), this.boundEnd = () => this.endDrag(), this.updateGeometry();
	}
	startDrag() {
		this.isDragging = !0, window.addEventListener("mousemove", this.boundMouseMove), window.addEventListener("mouseup", this.boundEnd), window.addEventListener("touchmove", this.boundTouchMove, { passive: !1 }), window.addEventListener("touchend", this.boundEnd);
	}
	endDrag() {
		this.isDragging = !1, window.removeEventListener("mousemove", this.boundMouseMove), window.removeEventListener("mouseup", this.boundEnd), window.removeEventListener("touchmove", this.boundTouchMove), window.removeEventListener("touchend", this.boundEnd), this.updateHandleTransition();
	}
	handleTrackClick(e) {
		this.calculateValueFromEvent(e);
	}
	calculateValueFromEvent(e) {
		"touches" in e && e.preventDefault();
		let t = this.el.getBoundingClientRect(), n = t.left + t.width / 2, r = t.top + t.height / 2, i = "touches" in e ? e.touches[0].clientX : e.clientX, a = "touches" in e ? e.touches[0].clientY : e.clientY, o = v(i - n, a - r, _(this.currentPosition), this.halfSweep, this.currentPosition);
		this.onChange(o);
	}
	updateGeometry() {
		let e = _(this.currentPosition), t = e - this.halfSweep, n = e + this.halfSweep, r = g(this.center, this.center, this.arcRadius, t, n);
		this.bgPath.setAttribute("d", r), this.gradientPath.setAttribute("d", r);
		let i = this.currentPosition === "left" ? n : t, a = this.currentPosition === "left" ? t : n, o = h(this.center, this.center, this.arcRadius, i), s = h(this.center, this.center, this.arcRadius, a);
		l(this.gradient, {
			x1: String(o.x),
			y1: String(o.y),
			x2: String(s.x),
			y2: String(s.y)
		});
	}
	update(e, t, n, r, a) {
		this.currentValue = e, this.currentHue = t, this.currentBaseSaturation = n, a !== this.currentPosition && (this.currentPosition = a, this.updateGeometry());
		let o = y(t, n, 11, E, D);
		for (let e = 0; e < this.gradientStops.length; e++) this.gradientStops[e].setAttribute("stop-color", o[e]);
		let s = _(a), l = s - this.halfSweep, u = s + this.halfSweep, d = a === "left" ? u : l, f = a === "left" ? l : u, p = d + e / 100 * (f - d), m = h(this.center, this.center, this.arcRadius, p), g = x(e), v = D(t, E(e, n), g);
		this.handle.setAttribute("cx", String(m.x)), this.handle.setAttribute("cy", String(m.y)), this.handle.setAttribute("fill", v), this.updateHandleTransition(), c(this.el, {
			opacity: r ? "1" : "0",
			transform: r ? "scale(1)" : "scale(0.8)",
			transition: `opacity ${this.animationDuration}ms ${i} ${this.animationDuration / 2}ms, transform ${this.animationDuration}ms ${i} ${this.animationDuration / 2}ms`
		});
	}
	updateHandleTransition() {
		c(this.handle, { transition: this.isDragging ? "none" : `cx ${this.animationDuration / 3}ms ease, cy ${this.animationDuration / 3}ms ease` });
	}
	destroy() {
		window.removeEventListener("mousemove", this.boundMouseMove), window.removeEventListener("mouseup", this.boundEnd), window.removeEventListener("touchmove", this.boundTouchMove), window.removeEventListener("touchend", this.boundEnd), this.el.remove();
	}
}, F = class {
	radius;
	animationDuration;
	el;
	solidBg;
	tintEl;
	constructor(e, t) {
		this.radius = e, this.animationDuration = t;
		let n = e * 2;
		this.el = o("div"), this.el.className = "bcp-bg-wrapper", c(this.el, {
			position: "absolute",
			width: `${n}px`,
			height: `${n}px`,
			pointerEvents: "none",
			zIndex: "0"
		}), this.solidBg = o("div"), this.solidBg.className = "bcp-bg-solid", c(this.solidBg, {
			position: "absolute",
			inset: "0",
			backgroundColor: "#FFFFFF",
			borderRadius: "50%",
			transform: "scale(1)",
			transition: `transform ${t}ms ${i}, opacity ${t}ms ${i}`
		}), this.el.appendChild(this.solidBg), this.tintEl = o("div"), c(this.tintEl, {
			position: "absolute",
			inset: "0",
			borderRadius: "50%",
			transition: `background-color ${t}ms ease`
		}), this.solidBg.appendChild(this.tintEl);
	}
	update(e, t, n, r) {
		c(this.solidBg, {
			transform: r ? "scale(0.9)" : "scale(0.98)",
			opacity: r ? "1" : "0"
		}), c(this.tintEl, { backgroundColor: O(e, t, n, 15) });
	}
	destroy() {
		this.el.remove();
	}
}, I = class {
	radius;
	barWidth;
	animationDuration;
	el;
	bgCircle;
	colorCircle;
	constructor(e, t, n) {
		this.radius = e, this.barWidth = t, this.animationDuration = n;
		let r = (e + t / 2) * 2 + 4;
		this.el = s("svg", {
			width: String(r),
			height: String(r)
		}), this.el.classList.add("bcp-svg"), c(this.el, {
			left: "50%",
			top: "50%",
			marginLeft: `${-r / 2}px`,
			marginTop: `${-r / 2}px`,
			zIndex: "5"
		});
		let i = String(r / 2), a = String(r / 2), o = String(e), l = String(t);
		this.bgCircle = s("circle", {
			cx: i,
			cy: a,
			r: o,
			fill: "none",
			stroke: "rgba(0,0,0,0.06)",
			"stroke-width": l
		}), this.colorCircle = s("circle", {
			cx: i,
			cy: a,
			r: o,
			fill: "none",
			"stroke-width": l
		}), this.el.appendChild(this.bgCircle), this.el.appendChild(this.colorCircle);
	}
	update(e, t, n, r, a) {
		let o = O(e, t, n, r);
		this.colorCircle.setAttribute("stroke", o), c(this.el, {
			opacity: a ? "1" : "0",
			transform: a ? "scale(1)" : "scale(0.8)",
			transition: `opacity ${this.animationDuration}ms ${i}, transform ${this.animationDuration}ms ${i}`
		});
	}
	destroy() {
		this.el.remove();
	}
}, L = class {
	coreSize;
	animationDuration;
	onClick;
	el;
	constructor(e, t, n) {
		this.coreSize = e, this.animationDuration = t, this.onClick = n, this.el = o("button", void 0, {
			type: "button",
			tabIndex: "0"
		}), this.el.className = "bcp-core", this.el.addEventListener("click", () => this.onClick()), c(this.el, {
			width: `${e}px`,
			height: `${e}px`,
			zIndex: "1000"
		});
	}
	update(e, t, n, r) {
		this.el.disabled = r, this.el.setAttribute("aria-label", `Color picker${t ? ", expanded" : ""}`), this.el.setAttribute("aria-expanded", String(t)), c(this.el, {
			backgroundColor: e,
			transform: t ? "scale(1)" : n ? "scale(1.05)" : "scale(1)",
			boxShadow: t ? "0 0 0 2px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.15)" : "0 2px 8px rgba(0,0,0,0.15)",
			transition: `transform ${this.animationDuration}ms ${i}, box-shadow ${this.animationDuration}ms ${i}`
		});
	}
	destroy() {
		this.el.remove();
	}
}, R = class {
	onClick;
	onMouseEnter;
	onMouseLeave;
	el;
	config;
	isHovered = !1;
	constructor(e, t, n, r) {
		this.onClick = t, this.onMouseEnter = n, this.onMouseLeave = r, this.config = e, this.el = o("button", void 0, {
			type: "button",
			"aria-label": `Select color hue ${e.hue}`,
			tabIndex: "-1"
		}), this.el.className = "bcp-petal", e.alpha !== 0 && this.el.classList.add("bcp-petal-visible"), this.el.addEventListener("click", () => this.onClick?.()), this.el.addEventListener("mouseenter", () => {
			this.isHovered = !0, this.onMouseEnter?.(), this.updateStyles(this.lastExpanded);
		}), this.el.addEventListener("mouseleave", () => {
			this.isHovered = !1, this.onMouseLeave?.(), this.updateStyles(this.lastExpanded);
		}), this.applyBaseStyles(), this.updateStyles(!1);
	}
	lastExpanded = !1;
	applyBaseStyles() {
		let { petalSize: e, config: t } = {
			petalSize: this.config.petalSize,
			config: this.config
		};
		c(this.el, {
			position: "absolute",
			width: `${e}px`,
			height: `${e}px`,
			borderRadius: "50%",
			border: "none",
			padding: "0",
			background: "none",
			left: "50%",
			top: "50%",
			marginLeft: `${-e / 2}px`,
			marginTop: `${-e / 2}px`
		}), t.clip === "left" ? this.el.style.clipPath = "polygon(0% -50%, 50% -50%, 50% 150%, 0% 150%)" : t.clip === "right" && (this.el.style.clipPath = "polygon(50% -50%, 100% -50%, 100% 150%, 50% 150%)");
	}
	update(e, t, n) {
		t !== void 0 && (this.isHovered = t), this.updateStyles(e, n);
	}
	updateStyles(e, t) {
		let n = e && !this.lastExpanded, r = this.config, a = this.isHovered, o = r.alpha === 0, s = (r.index / r.totalPetals * 360 - 90 + r.rotationOffset) * Math.PI / 180, l = Math.cos(s) * r.radius, u = Math.sin(s) * r.radius;
		if (e && t && !a && !o) {
			let e = l - t.x, n = u - t.y, r = Math.sqrt(e * e + n * n);
			if (r < 60) {
				let t = (1 - r / 60) * 6, i = Math.atan2(n, e);
				l += Math.cos(i) * t, u += Math.sin(i) * t;
			}
		}
		let d = r.alpha < 1 ? O(r.hue, r.saturation, r.lightness, r.alpha * 100) : D(r.hue, r.saturation, r.lightness), f = a ? 1.1 : 1, p = e && !n && t && !a ? "transform 150ms ease-out" : `transform ${r.animationDuration}ms ${i} ${e && !a ? r.staggerDelay : 0}ms`;
		c(this.el, {
			backgroundColor: d,
			transform: e ? `translate(${l}px, ${u}px) scale(${f})` : "translate(0, 0) scale(0)",
			opacity: e ? "1" : "0",
			filter: a && !o ? "brightness(1.1)" : "brightness(1)",
			transition: `${p},
                   opacity ${r.animationDuration}ms ${i} ${e && !a ? r.staggerDelay : 0}ms,
                   background-color 200ms ease,
                   box-shadow 200ms ease,
                   filter 200ms ease`,
			boxShadow: r.hasShadow && !o ? a ? "0 4px 12px rgba(0,0,0,0.25)" : "0 2px 6px rgba(0,0,0,0.15)" : "none",
			zIndex: String(r.zIndex),
			pointerEvents: r.pointerEvents
		}), this.el.tabIndex = e ? 0 : -1, this.lastExpanded = e;
	}
	destroy() {
		this.el.remove();
	}
};
//#endregion
//#region src/BlossomColorPicker.ts
function z(e, t) {
	if (e === t) return !0;
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
	return !0;
}
var B = {
	hue: 330,
	saturation: 70,
	alpha: 50,
	layer: "outer"
}, V = class {
	container;
	rootEl;
	containerEl;
	mousePos = null;
	rafId = null;
	opts;
	internalValue;
	controlledValue;
	isExpanded = !1;
	isHovering = !1;
	hoveredPetal = null;
	prevExpanded = !1;
	shiftOffset = {
		x: 0,
		y: 0
	};
	effectivePosition = "right";
	normalizedColors = [];
	layers = [];
	allColors = [];
	layerPrefixCounts = [];
	layerRadii = [];
	layerRotations = [];
	barRadius = 0;
	containerSize = 0;
	petalRenderers = [];
	colorBarRenderer;
	arcSliderRenderer = null;
	coreButtonRenderer;
	backgroundRenderer;
	hoverTimeout = null;
	closeTimeout = null;
	boundClickOutside;
	boundMouseMove;
	constructor(e, t) {
		this.container = e;
		let n = t?.defaultValue ?? B;
		this.opts = {
			colors: t?.colors ?? [],
			onChange: t?.onChange ?? (() => {}),
			onCollapse: t?.onCollapse ?? (() => {}),
			disabled: t?.disabled ?? !1,
			openOnHover: t?.openOnHover ?? !1,
			initialExpanded: t?.initialExpanded ?? !1,
			animationDuration: t?.animationDuration ?? 300,
			showAlphaSlider: t?.showAlphaSlider ?? !0,
			coreSize: t?.coreSize ?? 32,
			petalSize: t?.petalSize ?? 32,
			showCoreColor: t?.showCoreColor ?? !0,
			sliderPosition: t?.sliderPosition,
			adaptivePositioning: t?.adaptivePositioning ?? !0,
			circularBarWidth: t?.circularBarWidth ?? 12,
			sliderWidth: t?.sliderWidth ?? 12,
			sliderOffset: t?.sliderOffset ?? 30,
			collapsible: t?.collapsible ?? !0
		}, this.controlledValue = t?.value, this.internalValue = t?.value ?? n, this.isExpanded = !this.opts.collapsible || this.opts.initialExpanded, this.prevExpanded = this.isExpanded, this.effectivePosition = this.opts.sliderPosition || "right", this.boundClickOutside = this.handleClickOutside.bind(this), this.boundMouseMove = this.handleMouseMove.bind(this), this.computeLayout(), this.render(), this.update(), this.bindEvents();
	}
	setValue(e) {
		this.controlledValue = e, this.internalValue = e, this.update();
	}
	getValue() {
		let e = this.currentValue, t = e.saturation, n = x(t), r = this.allColors.find((t) => t.h === e.hue)?.s ?? 70, i = E(t, r);
		return j(e.hue, t, i, r, n, e.alpha, e.layer);
	}
	expand() {
		this.setExpanded(!0);
	}
	collapse() {
		this.setExpanded(!1);
	}
	toggle() {
		this.setExpanded(!this.isExpanded);
	}
	setOptions(e) {
		let t = !1;
		e.value !== void 0 && (this.controlledValue = e.value, this.internalValue = e.value), e.onChange !== void 0 && (this.opts.onChange = e.onChange), e.onCollapse !== void 0 && (this.opts.onCollapse = e.onCollapse), e.disabled !== void 0 && (this.opts.disabled = e.disabled), e.openOnHover !== void 0 && (this.opts.openOnHover = e.openOnHover), e.animationDuration !== void 0 && (this.opts.animationDuration = e.animationDuration), e.showCoreColor !== void 0 && (this.opts.showCoreColor = e.showCoreColor), e.sliderPosition !== void 0 && (this.opts.sliderPosition = e.sliderPosition), e.adaptivePositioning !== void 0 && (this.opts.adaptivePositioning = e.adaptivePositioning), e.initialExpanded !== void 0 && (this.opts.initialExpanded = e.initialExpanded), e.colors !== void 0 && !z(e.colors, this.opts.colors) && (this.opts.colors = e.colors, t = !0), e.coreSize !== void 0 && e.coreSize !== this.opts.coreSize && (this.opts.coreSize = e.coreSize, t = !0), e.petalSize !== void 0 && e.petalSize !== this.opts.petalSize && (this.opts.petalSize = e.petalSize, t = !0), e.circularBarWidth !== void 0 && e.circularBarWidth !== this.opts.circularBarWidth && (this.opts.circularBarWidth = e.circularBarWidth, t = !0), e.sliderWidth !== void 0 && e.sliderWidth !== this.opts.sliderWidth && (this.opts.sliderWidth = e.sliderWidth, t = !0), e.sliderOffset !== void 0 && e.sliderOffset !== this.opts.sliderOffset && (this.opts.sliderOffset = e.sliderOffset, t = !0), e.showAlphaSlider !== void 0 && e.showAlphaSlider !== this.opts.showAlphaSlider && (this.opts.showAlphaSlider = e.showAlphaSlider, t = !0), e.collapsible !== void 0 && e.collapsible !== this.opts.collapsible && (this.opts.collapsible = e.collapsible, this.opts.collapsible || (this.isExpanded = !0)), t && (this.destroyInner(), this.computeLayout(), this.render()), this.update();
	}
	destroy() {
		this.unbindEvents(), this.destroyInner(), this.rootEl && this.rootEl.parentNode && this.rootEl.remove();
	}
	get currentValue() {
		return this.controlledValue ?? this.internalValue;
	}
	get baseSaturation() {
		let e = this.currentValue;
		return e.originalSaturation === void 0 ? this.allColors.find((t) => t.h === e.hue)?.s ?? 70 : e.originalSaturation;
	}
	get coreColor() {
		let e = this.currentValue;
		if (this.isExpanded && !this.opts.showCoreColor) return "#FFFFFF";
		let t = e.lightness ?? x(e.saturation), n = e.originalSaturation ?? this.baseSaturation;
		return O(e.hue, n, t, e.alpha);
	}
	get currentLightness() {
		return this.currentValue.lightness ?? (this.currentValue.layer === "inner" ? 85 : 65);
	}
	computeLayout() {
		let e = this.opts.colors;
		this.normalizedColors = e && e.length > 0 ? e.map(w) : r, this.layers = M(this.normalizedColors), this.allColors = this.layers.flat(), this.layerPrefixCounts = [0];
		for (let e = 1; e < this.layers.length; e++) this.layerPrefixCounts.push(this.layerPrefixCounts[e - 1] + this.layers[e - 1].length);
		this.layerRadii = u(this.layers, this.opts.coreSize, this.opts.petalSize), this.layerRotations = d(this.layers), this.barRadius = f(this.layerRadii, this.opts.petalSize, this.opts.coreSize, 20), this.containerSize = p(this.barRadius, this.opts.circularBarWidth, this.opts.showAlphaSlider, this.opts.sliderOffset, this.opts.sliderWidth);
	}
	render() {
		this.rootEl || (this.rootEl = o("div"), this.rootEl.className = "bcp-root", this.rootEl.setAttribute("role", "group"), this.rootEl.setAttribute("aria-label", "Color picker"), c(this.rootEl, {
			width: `${this.opts.coreSize}px`,
			height: `${this.opts.coreSize}px`
		}), this.containerEl = o("div"), this.containerEl.className = "bcp-container", c(this.containerEl, {
			left: "50%",
			top: "50%"
		}), this.rootEl.appendChild(this.containerEl), this.container.appendChild(this.rootEl)), this.backgroundRenderer = new F(this.barRadius + this.opts.circularBarWidth / 2, this.opts.animationDuration), this.containerEl.appendChild(this.backgroundRenderer.el), this.colorBarRenderer = new I(this.barRadius, this.opts.circularBarWidth, this.opts.animationDuration), this.containerEl.appendChild(this.colorBarRenderer.el), this.petalRenderers = [];
		for (let e = 0; e < this.layers.length; e++) {
			let t = this.layers[e], n = this.layerRadii[e], r = this.layerRotations[e], i = this.layerPrefixCounts[e], a = t.length, o = this.layers.length, s = (o - e) * 100, c = 0, l = Infinity;
			for (let e = 0; e < a; e++) {
				let t = ((e / a * 360 - 90 + r) % 360 + 360) % 360, n = Math.min(Math.abs(t - 90), 360 - Math.abs(t - 90));
				n < l && (l = n, c = e);
			}
			for (let l = 0; l < t.length; l++) {
				let u = t[l], d = i * 20 + l * 20;
				if (l === c) {
					let t = new R({
						hue: u.h,
						saturation: u.s,
						lightness: u.l,
						index: l,
						totalPetals: a,
						petalSize: this.opts.petalSize,
						radius: n,
						animationDuration: this.opts.animationDuration,
						staggerDelay: d,
						zIndex: s - 1,
						rotationOffset: r,
						alpha: 1,
						pointerEvents: "none",
						hasShadow: !1,
						noRing: !0
					});
					this.petalRenderers.push(t), this.containerEl.appendChild(t.el);
					let i = new R({
						hue: u.h,
						saturation: u.s,
						lightness: u.l,
						index: l,
						totalPetals: a,
						petalSize: this.opts.petalSize,
						radius: n,
						animationDuration: this.opts.animationDuration,
						staggerDelay: d,
						zIndex: m(l, c, a, e, o, !0, !1),
						rotationOffset: r,
						alpha: 1,
						clip: "left",
						pointerEvents: "none",
						hasShadow: !1
					});
					this.petalRenderers.push(i), this.containerEl.appendChild(i.el);
					let f = new R({
						hue: u.h,
						saturation: u.s,
						lightness: u.l,
						index: l,
						totalPetals: a,
						petalSize: this.opts.petalSize,
						radius: n,
						animationDuration: this.opts.animationDuration,
						staggerDelay: d,
						zIndex: m(l, c, a, e, o, !1, !0),
						rotationOffset: r,
						alpha: 1,
						clip: "right",
						pointerEvents: "none",
						hasShadow: !1
					});
					this.petalRenderers.push(f), this.containerEl.appendChild(f.el);
					let p = new R({
						hue: u.h,
						saturation: u.s,
						lightness: u.l,
						index: l,
						totalPetals: a,
						petalSize: this.opts.petalSize,
						radius: n,
						animationDuration: this.opts.animationDuration,
						staggerDelay: d,
						zIndex: s + a + 20,
						rotationOffset: r,
						alpha: 0,
						pointerEvents: "auto",
						hasShadow: !1
					}, () => this.handlePetalClick(u, e), () => {
						this.hoveredPetal = {
							layer: e,
							index: l
						}, t.update(this.isExpanded, !0, this.mousePos), i.update(this.isExpanded, !0, this.mousePos), f.update(this.isExpanded, !0, this.mousePos);
					}, () => {
						this.hoveredPetal = null, t.update(this.isExpanded, !1, this.mousePos), i.update(this.isExpanded, !1, this.mousePos), f.update(this.isExpanded, !1, this.mousePos);
					});
					this.petalRenderers.push(p), this.containerEl.appendChild(p.el);
				} else {
					let t = new R({
						hue: u.h,
						saturation: u.s,
						lightness: u.l,
						index: l,
						totalPetals: a,
						petalSize: this.opts.petalSize,
						radius: n,
						animationDuration: this.opts.animationDuration,
						staggerDelay: d,
						zIndex: m(l, c, a, e, o),
						rotationOffset: r,
						alpha: 1,
						pointerEvents: "auto",
						hasShadow: !1
					}, () => this.handlePetalClick(u, e), () => {
						this.hoveredPetal = {
							layer: e,
							index: l
						};
					}, () => {
						this.hoveredPetal = null;
					});
					this.petalRenderers.push(t), this.containerEl.appendChild(t.el);
				}
			}
		}
		this.opts.showAlphaSlider && (this.arcSliderRenderer = new P(this.barRadius, this.opts.sliderWidth, this.opts.sliderOffset, this.opts.animationDuration, (e) => this.handleSliderChange(e), this.effectivePosition), this.containerEl.appendChild(this.arcSliderRenderer.el)), this.coreButtonRenderer = new L(this.opts.coreSize, this.opts.animationDuration, () => this.handleCoreClick()), this.containerEl.appendChild(this.coreButtonRenderer.el);
	}
	update() {
		let t = this.currentValue, n = this.opts.animationDuration;
		if (this.isExpanded && !this.prevExpanded && this.rootEl) {
			let t = e({
				elementRect: this.rootEl.getBoundingClientRect(),
				containerSize: this.containerSize,
				currentShiftOffset: {
					x: 0,
					y: 0
				},
				windowWidth: window.innerWidth,
				windowHeight: window.innerHeight,
				sliderPosition: this.opts.sliderPosition,
				adaptivePositioning: this.opts.adaptivePositioning,
				circularBarWidth: this.opts.circularBarWidth,
				sliderOffset: this.opts.sliderOffset
			});
			this.shiftOffset = t.shiftOffset, this.effectivePosition = t.effectivePosition;
		} else this.isExpanded || (this.shiftOffset = {
			x: 0,
			y: 0
		}, this.effectivePosition = this.opts.sliderPosition || "right");
		c(this.containerEl, {
			width: `${this.isExpanded ? this.containerSize : this.opts.coreSize}px`,
			height: `${this.isExpanded ? this.containerSize : this.opts.coreSize}px`,
			transform: `translate(calc(-50% + ${this.shiftOffset.x}px), calc(-50% + ${this.shiftOffset.y}px))`,
			transition: `width ${n}ms ${i}, height ${n}ms ${i}, transform ${n}ms ${i}`,
			zIndex: this.isExpanded ? "50" : "0"
		}), this.backgroundRenderer.update(t.hue, t.saturation, this.currentLightness, this.isExpanded), this.colorBarRenderer.update(t.hue, E(t.saturation, this.baseSaturation), this.currentLightness, t.alpha, this.isExpanded);
		for (let e of this.petalRenderers) e.update(this.isExpanded, void 0, this.mousePos);
		this.arcSliderRenderer && this.arcSliderRenderer.update(t.saturation, t.hue, this.baseSaturation, this.isExpanded, this.effectivePosition), this.coreButtonRenderer.update(this.coreColor, this.isExpanded, this.isHovering, this.opts.disabled), this.prevExpanded && !this.isExpanded && this.fireOnCollapse(), this.prevExpanded = this.isExpanded;
	}
	bindEvents() {
		this.containerEl.addEventListener("mouseenter", () => {
			this.handleMouseEnter();
		}), this.containerEl.addEventListener("mouseleave", () => {
			this.handleMouseLeave();
		}), this.containerEl.addEventListener("mousemove", this.boundMouseMove);
	}
	unbindEvents() {
		document.removeEventListener("mousedown", this.boundClickOutside), this.containerEl.removeEventListener("mousemove", this.boundMouseMove);
	}
	handleMouseMove(e) {
		let t = this.containerEl.getBoundingClientRect();
		this.mousePos = {
			x: e.clientX - (t.left + t.width / 2),
			y: e.clientY - (t.top + t.height / 2)
		}, this.isExpanded && !this.rafId && (this.rafId = requestAnimationFrame(() => {
			this.updateInteractive(), this.rafId = null;
		}));
	}
	updateInteractive() {
		let e = this.currentValue;
		for (let e of this.petalRenderers) e.update(this.isExpanded, void 0, this.mousePos);
		this.backgroundRenderer.update(e.hue, e.saturation, this.currentLightness, this.isExpanded), this.colorBarRenderer.update(e.hue, E(e.saturation, this.baseSaturation), this.currentLightness, e.alpha, this.isExpanded), this.arcSliderRenderer && this.arcSliderRenderer.update(e.saturation, e.hue, this.baseSaturation, this.isExpanded, this.effectivePosition), this.coreButtonRenderer.update(this.coreColor, this.isExpanded, this.isHovering, this.opts.disabled);
	}
	destroyInner() {
		for (let e of this.petalRenderers) e.destroy();
		this.petalRenderers = [], this.colorBarRenderer?.destroy(), this.arcSliderRenderer?.destroy(), this.arcSliderRenderer = null, this.coreButtonRenderer?.destroy(), this.backgroundRenderer?.destroy();
	}
	setExpanded(e) {
		this.isExpanded = !this.opts.collapsible || e, this.isExpanded ? document.addEventListener("mousedown", this.boundClickOutside) : document.removeEventListener("mousedown", this.boundClickOutside), this.update();
	}
	handleClickOutside(e) {
		this.opts.collapsible && this.containerEl && !this.containerEl.contains(e.target) && this.setExpanded(!1);
	}
	handleMouseEnter() {
		!this.opts.disabled && this.opts.openOnHover && this.opts.collapsible && (this.closeTimeout &&= (clearTimeout(this.closeTimeout), null), this.isHovering = !0, this.hoverTimeout = setTimeout(() => {
			this.setExpanded(!0);
		}, 100));
	}
	handleMouseLeave() {
		this.hoverTimeout &&= (clearTimeout(this.hoverTimeout), null), this.isHovering = !1, this.opts.openOnHover && this.opts.collapsible && (this.closeTimeout = setTimeout(() => {
			this.setExpanded(!1);
		}, 200));
	}
	handleCoreClick() {
		!this.opts.disabled && this.opts.collapsible && this.setExpanded(!this.isExpanded);
	}
	handlePetalClick(e, t) {
		let n = b(e.l), r = t === 0 ? "inner" : "outer", i = e.s, a = {
			hue: e.h,
			saturation: n,
			lightness: e.l,
			originalSaturation: e.s,
			layer: r,
			alpha: this.currentValue.alpha
		};
		this.controlledValue === void 0 && (this.internalValue = a), this.opts.onChange(j(e.h, n, i, e.s, e.l, this.currentValue.alpha, r)), this.update();
	}
	handleSliderChange(e) {
		let t = x(e), n = E(e, this.baseSaturation);
		this.internalValue = {
			...this.currentValue,
			saturation: e,
			lightness: t,
			originalSaturation: this.baseSaturation
		}, this.opts.onChange(j(this.currentValue.hue, e, n, this.baseSaturation, t, this.currentValue.alpha, this.currentValue.layer)), this.update();
	}
	fireOnCollapse() {
		let e = this.currentValue, t = e.saturation, n = x(t), r = this.allColors.find((t) => t.h === e.hue)?.s ?? 70, i = E(t, r);
		this.opts.onCollapse(j(e.hue, t, i, r, n, e.alpha, e.layer));
	}
}, H = class {
	container;
	rootEl;
	topEl;
	bottomEl;
	alphaSliderTrack;
	alphaSliderHandle;
	alphaSliderInput;
	inputsEl;
	toggleBtn;
	picker;
	mode = "HSLA";
	opts;
	themeMediaQuery = null;
	themeObserver = null;
	boundThemeChange;
	isInternalUpdate = !1;
	constructor(e, t) {
		this.container = e, this.opts = {
			...t,
			collapsible: t?.collapsible ?? !1
		}, this.boundThemeChange = () => {
			this.opts.darkMode === void 0 && this.applyTheme();
		}, this.render(), this.bindThemeListeners(), this.applyTheme(), this.picker = new V(this.topEl, {
			...this.getPickerOptions(),
			onChange: (e) => this.handlePickerChange(e)
		}), this.updateInputs();
	}
	render() {
		this.rootEl = o("div", {}, { class: "bcp-chrome-container" }), this.topEl = o("div", {}, { class: "bcp-chrome-top" }), this.bottomEl = o("div", {}, { class: "bcp-chrome-bottom" });
		let e = o("div", {}, {
			class: "bcp-chrome-sliders",
			style: "margin-bottom: 16px;"
		}), t = o("div", {}, { class: "bcp-chrome-slider-container" });
		this.alphaSliderTrack = o("div", {}, { class: "bcp-chrome-alpha-gradient" }), this.alphaSliderHandle = o("div", {}, { class: "bcp-chrome-slider-handle" }), this.alphaSliderInput = o("input", {}, {
			type: "range",
			min: "0",
			max: "100",
			step: "1",
			class: "bcp-chrome-native-slider"
		}), this.alphaSliderInput.addEventListener("input", () => {
			let e = parseInt(this.alphaSliderInput.value);
			this.syncAlpha(e);
		}), t.appendChild(this.alphaSliderTrack), t.appendChild(this.alphaSliderHandle), t.appendChild(this.alphaSliderInput), e.appendChild(t), this.bottomEl.appendChild(e);
		let n = o("div", {}, { class: "bcp-chrome-inputs-row" });
		this.inputsEl = o("div", {}, { class: "bcp-chrome-inputs-container" }), this.toggleBtn = o("button", {}, {
			class: "bcp-chrome-toggle",
			type: "button"
		}), this.toggleBtn.innerHTML = "\n      <svg width=\"12\" height=\"15\" viewBox=\"0 0 12 15\" fill=\"none\">\n        <path d=\"M6 0L10.3301 4.5H1.66987L6 0Z\" fill=\"currentColor\" />\n        <path d=\"M6 15L1.66987 10.5L10.3301 10.5L6 15Z\" fill=\"currentColor\" />\n      </svg>\n    ", this.toggleBtn.addEventListener("click", () => this.toggleMode()), n.appendChild(this.inputsEl), n.appendChild(this.toggleBtn), this.bottomEl.appendChild(n), this.rootEl.appendChild(this.topEl), this.rootEl.appendChild(this.bottomEl), this.container.appendChild(this.rootEl);
	}
	toggleMode() {
		this.mode = this.mode === "HEX" ? "RGBA" : this.mode === "RGBA" ? "HSLA" : "HEX", this.updateInputs();
	}
	handlePickerChange(e) {
		this.isInternalUpdate || (this.updateInputs(), this.opts.onChange && this.opts.onChange(e));
	}
	updateInputs() {
		let e = this.picker.getValue();
		this.alphaSliderInput.value = String(e.alpha), this.alphaSliderHandle.style.left = `${e.alpha}%`;
		let t = `rgb(${e.r}, ${e.g}, ${e.b})`;
		this.alphaSliderTrack.style.background = `linear-gradient(to right, rgba(${e.r}, ${e.g}, ${e.b}, 0), ${t})`, this.inputsEl.innerHTML = "", this.mode === "HEX" ? (this.inputsEl.className = "bcp-chrome-inputs-hex", this.renderHexInputs(e)) : this.mode === "RGBA" ? (this.inputsEl.className = "bcp-chrome-inputs-rgba", this.renderRgbaInputs(e)) : (this.inputsEl.className = "bcp-chrome-inputs-hsla", this.renderHslaInputs(e));
	}
	renderHexInputs(e) {
		let t = this.createInputGroup("HEX", e.hex.toUpperCase(), (t) => {
			if (/^#[0-9A-F]{6}$/i.test(t)) {
				let n = S(t);
				this.syncPicker({
					hue: n.h,
					saturation: b(n.l),
					lightness: n.l,
					originalSaturation: n.s,
					alpha: e.alpha,
					layer: e.layer
				});
			}
		});
		this.inputsEl.appendChild(t);
	}
	renderRgbaInputs(e) {
		let t = this.createInputGroup("R", String(e.r), () => this.syncRgba(e)), n = this.createInputGroup("G", String(e.g), () => this.syncRgba(e)), r = this.createInputGroup("B", String(e.b), () => this.syncRgba(e)), i = this.createInputGroup("A", e.alpha === 100 ? "1" : (e.alpha / 100).toFixed(2), () => this.syncRgba(e));
		this.inputsEl.appendChild(t), this.inputsEl.appendChild(n), this.inputsEl.appendChild(r), this.inputsEl.appendChild(i);
	}
	syncRgba(e) {
		let t = this.inputsEl.querySelectorAll("input"), n = parseInt(t[0].value), r = parseInt(t[1].value), i = parseInt(t[2].value), a = parseFloat(t[3].value);
		if (!t[3].value.endsWith(".") && !isNaN(n) && !isNaN(r) && !isNaN(i) && !isNaN(a)) {
			let t = C(n, r, i);
			this.syncPicker({
				hue: t.h,
				saturation: b(t.l),
				lightness: t.l,
				originalSaturation: t.s,
				alpha: Math.max(0, Math.min(100, a * 100)),
				layer: e.layer
			});
		}
	}
	renderHslaInputs(e) {
		let t = this.createInputGroup("H", String(Math.round(e.hue)), () => this.syncHsla(e)), n = this.createInputGroup("S", String(Math.round(e.saturation)), () => this.syncHsla(e)), r = this.createInputGroup("L", String(Math.round(e.lightness ?? 50)), () => this.syncHsla(e)), i = this.createInputGroup("A", e.alpha === 100 ? "1" : (e.alpha / 100).toFixed(2), () => this.syncHsla(e));
		this.inputsEl.appendChild(t), this.inputsEl.appendChild(n), this.inputsEl.appendChild(r), this.inputsEl.appendChild(i);
	}
	syncHsla(e) {
		let t = this.inputsEl.querySelectorAll("input"), n = parseInt(t[0].value), r = parseInt(t[1].value), i = parseInt(t[2].value), a = parseFloat(t[3].value);
		t[3].value.endsWith(".") || !isNaN(n) && !isNaN(r) && !isNaN(i) && !isNaN(a) && this.syncPicker({
			hue: Math.max(0, Math.min(360, n)),
			saturation: Math.max(0, Math.min(100, r)),
			lightness: Math.max(0, Math.min(100, i)),
			originalSaturation: e.originalSaturation ?? 70,
			alpha: Math.max(0, Math.min(100, a * 100)),
			layer: e.layer
		});
	}
	syncAlpha(e) {
		let t = this.picker.getValue();
		this.syncPicker({
			hue: t.hue,
			saturation: t.saturation,
			lightness: t.lightness,
			originalSaturation: t.originalSaturation,
			alpha: e,
			layer: t.layer
		}), this.updateInputs();
	}
	createInputGroup(e, t, n) {
		let r = o("div", {}, { class: "bcp-chrome-input-group" }), i = o("input", {}, { class: "bcp-chrome-input" });
		i.value = t, i.addEventListener("input", () => n(i.value));
		let a = o("span", {}, { class: "bcp-chrome-label" });
		return a.textContent = e, r.appendChild(i), r.appendChild(a), r;
	}
	syncPicker(e) {
		this.isInternalUpdate = !0, this.picker.setValue(e), this.isInternalUpdate = !1;
	}
	setValue(e) {
		this.picker.setValue(e), this.updateInputs();
	}
	getValue() {
		return this.picker.getValue();
	}
	setOptions(e) {
		this.opts = {
			...this.opts,
			...e
		}, this.picker.setOptions(this.getPickerOptions()), this.applyTheme(), this.updateInputs();
	}
	destroy() {
		this.themeMediaQuery?.removeEventListener?.("change", this.boundThemeChange), this.themeObserver?.disconnect(), this.picker.destroy(), this.rootEl.remove();
	}
	getPickerOptions() {
		return {
			value: this.opts.value,
			defaultValue: this.opts.defaultValue,
			colors: this.opts.colors,
			onChange: this.opts.onChange,
			onCollapse: this.opts.onCollapse,
			disabled: this.opts.disabled,
			openOnHover: this.opts.openOnHover,
			initialExpanded: this.opts.initialExpanded,
			animationDuration: this.opts.animationDuration,
			showAlphaSlider: this.opts.showAlphaSlider,
			coreSize: this.opts.coreSize,
			petalSize: this.opts.petalSize,
			showCoreColor: this.opts.showCoreColor,
			sliderPosition: this.opts.sliderPosition,
			adaptivePositioning: this.opts.adaptivePositioning,
			circularBarWidth: this.opts.circularBarWidth,
			sliderWidth: this.opts.sliderWidth,
			sliderOffset: this.opts.sliderOffset,
			collapsible: this.opts.collapsible
		};
	}
	bindThemeListeners() {
		typeof window > "u" || (this.themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)"), this.themeMediaQuery.addEventListener?.("change", this.boundThemeChange), this.themeObserver = new MutationObserver(this.boundThemeChange), this.themeObserver.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: ["class", "data-theme"]
		}));
	}
	isDarkMode() {
		return typeof this.opts.darkMode == "boolean" ? this.opts.darkMode : typeof window > "u" ? !1 : this.container.closest(".dark") !== null || document.documentElement.classList.contains("dark") || this.themeMediaQuery?.matches === !0;
	}
	applyTheme() {
		let e = this.isDarkMode();
		this.rootEl.classList.toggle("bcp-dark", e), this.rootEl.classList.toggle("bcp-force-light", this.opts.darkMode === !1);
		let t = {
			containerBackground: "--bcp-chrome-container-bg",
			topBackground: "--bcp-chrome-top-bg",
			bottomBackground: "--bcp-chrome-bottom-bg",
			borderColor: "--bcp-chrome-border",
			inputBackground: "--bcp-chrome-input-bg",
			inputBorderColor: "--bcp-chrome-input-border",
			inputTextColor: "--bcp-chrome-input-text",
			labelColor: "--bcp-chrome-label",
			sliderHandleBackground: "--bcp-chrome-slider-handle-bg",
			sliderHandleBorderColor: "--bcp-chrome-slider-handle-border",
			toggleColor: "--bcp-chrome-toggle-color",
			shadow: "--bcp-chrome-shadow"
		};
		for (let e of Object.values(t)) this.rootEl.style.removeProperty(e);
		if (e && this.opts.darkModeColors) for (let [e, n] of Object.entries(this.opts.darkModeColors)) n && this.rootEl.style.setProperty(t[e], n);
	}
};
//#endregion
export { V as BlossomColorPicker, H as ChromePicker, r as DEFAULT_COLORS, n as INNER_COLORS, t as OUTER_COLORS, f as calculateBarRadius, p as calculateContainerSize, u as calculateLayerRadii, d as calculateLayerRotations, j as createColorOutput, m as getPetalZIndex, E as getVisualSaturation, S as hexToHsl, T as hslToHex, k as hslToRgb, D as hslToString, O as hslaToString, b as lightnessToSliderValue, M as organizeColorsIntoLayers, w as parseColor, C as rgbToHsl, A as rgbaToString, x as sliderValueToLightness };

