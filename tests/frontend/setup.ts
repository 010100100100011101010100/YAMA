import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom has no native dialog implementation; browser checks cover modality.
HTMLDialogElement.prototype.show = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };

// Responsive layout behavior is verified in the browser; jsdom has no matchMedia.
Object.defineProperty(window, "matchMedia", { writable: true, value: (media: string) => ({
  matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
}) });

// jsdom cannot draw canvas. Orb lifecycle tests supply a drawing context;
// the live-browser review verifies its pixels and task presentation.
HTMLCanvasElement.prototype.getContext = () => null;
