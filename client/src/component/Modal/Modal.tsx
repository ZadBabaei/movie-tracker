import React, { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";
import "./Modal.css";

export type ModalSize = "sm" | "md" | "lg" | "xl";
export type ModalVariant = "default" | "danger";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Panel width. sm 420 · md 560 · lg 760 · xl 1200 */
  size?: ModalSize;
  /** `danger` tints the panel border for destructive confirmations. */
  variant?: ModalVariant;
  /** Renders a styled header and wires up aria-labelledby. */
  title?: string;
  /** Accessible name when the panel renders its own heading instead of `title`. */
  ariaLabel?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  /**
   * Skip the panel chrome (surface, border, padding, close button, title) and
   * render children straight into the shared scrim. For modals that bring their
   * own card styling — onboarding, the cinematic vote results — so they keep
   * the shared behaviour, scrim and stacking without a card-in-a-card look.
   */
  bare?: boolean;
  /** Extra class on the panel, for per-modal layout tweaks. */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Number of modals currently mounted. The scroll lock is only applied when the
 * first one opens and only released when the last one closes, so stacked
 * modals don't unlock the page prematurely.
 */
let openModalCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

const lockBodyScroll = () => {
  if (openModalCount === 0) {
    const { body, documentElement } = document;
    const scrollBarWidth = window.innerWidth - documentElement.clientWidth;

    previousBodyOverflow = body.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;

    body.style.overflow = "hidden";
    // Compensate for the removed scrollbar so the page doesn't shift sideways.
    if (scrollBarWidth > 0) {
      body.style.paddingRight = `${scrollBarWidth}px`;
    }
  }
  openModalCount += 1;
};

const releaseBodyScroll = () => {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = "md",
  variant = "default",
  title,
  ariaLabel,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  bare = false,
  className = "",
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const generatedId = useId();
  const titleId = `modal-title-${generatedId}`;

  // Keep the latest onClose in a ref so the focus effect below doesn't depend on
  // its identity. Parents often pass an inline handler that changes on every
  // render; without this, each keystroke re-ran the effect and stole focus back
  // to the first focusable element (the close button).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap: keep Tab cycling inside the panel. Elements are re-queried on
  // every keypress because modal content can change (e.g. multi-step flows).
  const handleTabKey = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => el.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        handleTabKey(event);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Move focus into the panel so keyboard and screen-reader users land inside.
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      releaseBodyScroll();
      lastFocusedRef.current?.focus();
    };
  }, [isOpen, closeOnEscape, handleTabKey]);

  if (!isOpen) return null;

  if (bare) {
    return createPortal(
      <div
        className="mt-modal-overlay"
        onClick={closeOnOverlayClick ? onClose : undefined}
      >
        <div
          ref={panelRef}
          className={`mt-modal-bare ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="mt-modal-overlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        ref={panelRef}
        className={`mt-modal-panel mt-modal-panel--${size} mt-modal-panel--${variant} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            type="button"
            className="mt-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <FaTimes />
          </button>
        )}

        {title && (
          <h2 id={titleId} className="mt-modal-title">
            {title}
          </h2>
        )}

        {children}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
