# Third-Party Notices

AirMic is MIT licensed (see [LICENSE](LICENSE)). Some UI components in this
repository are derived from the projects below; their notices are reproduced
here as required by their licenses.

## EasyUI

- Source: <https://github.com/Surajmaurya1/easyui>
- License: MIT
- Copyright (c) 2026 Suraj Maurya
- Used in:
  - `prototype/src/components/ui/*.tsx`
  - `prototype/src/lib/motion-tokens.ts`
  - `prototype/src/lib/constants.ts`
  - `prototype/src/components/registry/catalog-index.ts`
  - `prototype/src/types/component.ts`
  - `android/src/components/ui/drag-to-confirm.tsx`

EasyUI's components are used as a starting point for the prototype and some
animation/layout patterns. AirMic's own visual language, colors and product
behavior are defined in `prototype/DESIGN.md`.

```
MIT License

Copyright (c) 2026 Suraj Maurya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime dependencies

These are installed separately or declared as package dependencies; they are
not vendored copies. Their own licenses apply:

- [BlackHole 2ch](https://existential.audio/blackhole/) — GPL-3.0, installed
  separately by the user as the virtual audio device.
- [React](https://react.dev/) — MIT
- [Capacitor](https://capacitorjs.com/) — MIT
- [Tailwind CSS](https://tailwindcss.com/) — MIT
- [Framer Motion](https://www.framer.com/motion/) — MIT
- [Lucide](https://lucide.dev/) — ISC
- [shadcn/ui](https://ui.shadcn.com/) — MIT
