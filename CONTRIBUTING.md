# Contributing to JSON-driven UI SDK

Thank you for your interest in contributing to the JSON-driven UI SDK! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Issues
- Check if the issue already exists
- Provide clear description and steps to reproduce
- Include code examples when relevant
- Specify SDK version and environment

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit with clear message (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yeria-app/yeriasdk.git
cd yeriasdk

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

### Coding Standards

- Use TypeScript for all new code
- Follow existing code style
- Add JSDoc comments for public APIs
- Write tests for new features
- Ensure no TypeScript errors
- Keep commits focused and atomic

### Testing

- Write unit tests for new functionality
- Ensure all existing tests pass
- Aim for high code coverage
- Test edge cases and error conditions

### Documentation

- Update README for new features
- Add TypeScript types with clear documentation
- Include examples for new functionality
- Update CHANGELOG.md

#### Writing a spec page

Provider-facing documentation lives in `specs/`. Three rules, no exceptions:

1. **Write the HTML pair, not Markdown.** A page is two body fragments:
   `specs/en/<page>.html` and `specs/fr/<page>.html`. No `<html>`, no `<head>`,
   no framework tag — the site wraps them. They are the source.

   The `specs/*.md` siblings are kept — they are what a reader sees on GitHub —
   but how they stay current is **not settled yet**: today they are edited by
   hand, and they have already drifted from the HTML on several pages.
   `scripts/render-specs-md.py` can regenerate them, and `--check` reports which
   are stale; it is deliberately not wired into any pipeline until the drift is
   reconciled. Until then, if you change a page, change both.
2. **The two languages stay aligned.** Same headings, same tables, same code
   blocks, in the same order. **Anchors (`id`) stay in English in both files**:
   an anchor is a URL fragment, and a deep link must survive a language switch.
   `python3 specs/check-fr.py specs/fr/<page>.html` flags prose left in English.
3. **A page only exists once it is listed.** Add it to
   `yeria-ui/definitions/docs-catalog.js`, then run `yeria-ui/sync-docs.sh` to
   mirror the fragments into the site and colour the code blocks.

Markup the site's stylesheet expects: `<h2 id="…">` / `<h3 id="…">`, `<p>`,
`<ul><li>`, `<div class="ys-table-wrap"><table>…`, inline `<code class="ys-code">`,
and `<pre class="ys-codeblock" data-lang="javascript"><code>…`.

Run your samples before you write them down. A documented call that does not
exist is worse than an undocumented one — and if the clients do not honour a
field yet, say so on the page rather than letting it read as a working feature.

## Questions?

Feel free to open an issue for any questions about contributing.