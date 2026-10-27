import React from 'react';

const paths = {
  camera: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="3" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
    </>
  ),
  screen: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4m-4-11 4-4 4 4m-4-4v8" />
    </>
  ),
  chat: (
    <>
      <path d="M5 3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H9l-6 3V6a3 3 0 0 1 2-3Z" />
      <path d="M7 8h10M7 12h7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M1 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2m0-17a4 4 0 0 1 0 8m3 3a6 6 0 0 1 3 5v1" />
    </>
  ),
  link: (
    <>
      <path d="m10 13 4-4m-7 6-1 1a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6M17 9l1-1a4 4 0 0 0-6-6L8 6a4 4 0 0 0 0 6" />
    </>
  ),
  leave: (
    <>
      <path d="M3 16c4-7 14-7 18 0l-3 4-4-2v-3h-4v3l-4 2-3-4Z" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  hand: (
    <>
      <path d="M7 12V5a2 2 0 0 1 4 0v6m0-7a2 2 0 0 1 4 0v7m0-5a2 2 0 0 1 4 0v10a7 7 0 0 1-13 4l-4-7a2 2 0 0 1 3-2l2 2m12-4a2 2 0 0 1 3 2v5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 8a3 3 0 1 1 4 3c-1 0-1 1-1 3m0 3h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  send: <path d="m22 2-7 20-4-9L2 9 22 2ZM11 13 22 2" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
};
export function Icon({ name, size = 21, off = false, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.camera}
      {off && <path d="m2 2 20 20" strokeWidth="2.2" />}
    </svg>
  );
}
export function Brand({ light = false }) {
  return (
    <a
      className={`brand ${light ? 'brand-light' : ''}`}
      href="/"
      aria-label="Meet Hub home"
    >
      <img src="/favicon.svg" alt="" />
      <span>
        Meet<span className="brand-thin"> Hub</span>
      </span>
    </a>
  );
}
