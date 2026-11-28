# Device-aware installation

**Status**: Completed — October 31, 2026

## Overview

Users should reach the installation path that fits their device from one Install entry point, while retaining access to every platform and the browser workspace.

## Detect and recommend

- Given iOS, Android or an iPad requesting a desktop site, recommend home-screen installation.
- Given Windows, macOS or Linux, select that desktop platform without guessing the processor architecture.
- Given an unknown device or ChromeOS, preserve manual platform selection and browser access.

## Install chooser

- Given a mobile visit to Downloads, show the chooser once per session unless the app is already running installed.
- Given unsupported native prompting, provide home-screen instructions and keep the browser path available.
- Given a supported installability event, invoke its single-use prompt only after the user clicks Install.
- Given dismissal, prompt failure or installation, clear the pending event and show the appropriate state.
- Given a keyboard or small screen, support focus containment, Escape, focus restoration and internal scrolling.

## Distribution

- Given an unqualified desktop or CLI release, preserve existing release gates and withhold downloads and executable instructions.
- Given a reviewed CLI release, offer separately copyable download/verification, review and pinned installation steps.
- Given browser installation, use a public manifest with stable app identity, standalone display and correctly sized icons; make no offline-runtime claim.
