"""Render the local research reports without third-party dependencies.

Run from any directory: python <path-to-this-file>
The generated gallery references screenshots beside index.html.
"""
from __future__ import annotations

import html
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit

REPORTS = Path(__file__).resolve().parent
ROOT = REPORTS.parents[2]
OUTPUT = ROOT / "qa" / "design-research-2026-10-15" / "index.html"
FILES = sorted(REPORTS.glob("[0-9][0-9]-*.md"))
REFERENCED_IMAGES: set[str] = set()


def slug(path: Path) -> str:
    return path.stem


def href(target: str, source: Path, image: bool = False) -> str:
    target = target.strip("<>")
    if image:
        filename = Path(unquote(target).replace("\\", "/")).name
        if (OUTPUT.parent / filename).is_file():
            REFERENCED_IMAGES.add(filename)
            return quote(filename)
    if target.startswith(("https://", "http://", "#", "mailto:")):
        return target
    parsed = urlsplit(target)
    filename = Path(unquote(parsed.path).replace("\\", "/")).name
    match = next((p for p in FILES if p.name == filename), None)
    if match:
        return "#" + slug(match)
    # Report-relative assets outside the gallery remain ordinary local links.
    if not re.match(r"^[A-Za-z]:", target):
        resolved = (source.parent / unquote(parsed.path)).resolve()
        try:
            return "../../" + quote(str(resolved.relative_to(ROOT)).replace("\\", "/"))
        except ValueError:
            pass
    return target if not target.lower().startswith(("javascript:", "data:")) else "#"


INLINE = re.compile(r"`([^`]+)`|\[([^\]]+)\]\((<[^>]+>|[^)]+)\)|\*\*([^*]+)\*\*|(?<!\*)\*([^*]+)\*(?!\*)")


def inline(text: str, source: Path) -> str:
    pieces: list[str] = []
    cursor = 0
    for match in INLINE.finditer(text):
        pieces.append(html.escape(text[cursor:match.start()]))
        code, label, target, strong, emphasis = match.groups()
        if code is not None:
            pieces.append(f"<code>{html.escape(code)}</code>")
        elif label is not None:
            url = href(target, source)
            external = ' target="_blank" rel="noopener noreferrer"' if url.startswith(("https://", "http://")) else ""
            pieces.append(f'<a href="{html.escape(url, quote=True)}"{external}>{html.escape(label)}</a>')
        elif strong is not None:
            pieces.append(f"<strong>{html.escape(strong)}</strong>")
        else:
            pieces.append(f"<em>{html.escape(emphasis)}</em>")
        cursor = match.end()
    pieces.append(html.escape(text[cursor:]))
    return "".join(pieces)


def figure(label: str, target: str, source: Path) -> str:
    url = html.escape(href(target, source, image=True), quote=True)
    caption = html.escape(label)
    return f'<figure><a class="image-link" href="{url}" target="_blank" rel="noopener" aria-label="Open full screenshot: {caption}"><img src="{url}" alt="{caption}" loading="lazy" decoding="async"></a><figcaption><span class="caption-mark">↗</span>{caption}<span class="full-image">Open full image</span></figcaption></figure>'


def render(markdown: str, source: Path) -> str:
    lines = markdown.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("```"):
            i += 1
            content = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                content.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(content)) + "</code></pre>")
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            level = min(6, len(heading[1]) + 1)
            # The report title is rendered in its separate article header.
            if len(heading[1]) != 1:
                out.append(f"<h{level}>{inline(heading[2], source)}</h{level}>")
            i += 1
            continue
        image = re.fullmatch(r"!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)", line)
        if image:
            figures = []
            while i < len(lines):
                image = re.fullmatch(r"!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)", lines[i].strip())
                if image:
                    figures.append(figure(image[1], image[2], source))
                    i += 1
                elif not lines[i].strip() and i + 1 < len(lines) and lines[i + 1].strip().startswith("!["):
                    i += 1
                else:
                    break
            out.append('<div class="evidence-grid">' + "".join(figures) + "</div>")
            continue
        item = re.match(r"^(\d+\.|[-*])\s+(.+)$", line)
        if item:
            ordered = item[1][0].isdigit()
            tag = "ol" if ordered else "ul"
            start = f' start="{int(item[1][:-1])}"' if ordered else ""
            items = []
            while i < len(lines):
                item = re.match(r"^(\d+\.|[-*])\s+(.+)$", lines[i].strip())
                if not item or item[1][0].isdigit() != ordered:
                    break
                items.append("<li>" + inline(item[2], source) + "</li>")
                i += 1
            out.append(f"<{tag}{start}>" + "".join(items) + f"</{tag}>")
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?[\s:|-]+\|?$", lines[i + 1].strip()):
            rows = []
            header = True
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = lines[i].strip()
                if re.fullmatch(r"[\s:|-]+", row):
                    i += 1
                    continue
                cell = "th" if header else "td"
                rows.append("<tr>" + "".join(f"<{cell}>{inline(value.strip(), source)}</{cell}>" for value in row.strip("|").split("|")) + "</tr>")
                header = False
                i += 1
            out.append('<div class="table-wrap"><table>' + "".join(rows) + "</table></div>")
            continue
        if line.startswith(">"):
            out.append("<blockquote>" + inline(line.lstrip("> "), source) + "</blockquote>")
            i += 1
            continue
        if re.fullmatch(r"[-*_]{3,}", line):
            out.append("<hr>")
            i += 1
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,6}\s|!\[|\d+\.\s|[-*]\s|```|>|\|)", lines[i].strip()):
            paragraph.append(lines[i].strip())
            i += 1
        out.append("<p>" + inline(" ".join(paragraph), source) + "</p>")
    return "\n".join(out)


LABELS = {
    "00": ("Overview", "Research synthesis", "overview"),
    "01": ("Planner", "Today & To-do", "planner"),
    "02": ("Planner", "Calendar, goals & reminders", "planner"),
    "03": ("Daily rhythm", "Routines, wake & wind-down", "rhythm"),
    "04": ("Food & fitness", "Nutrition Tracker", "food"),
    "05": ("Food & fitness", "Meals, recipes & shopping", "food"),
    "06": ("Food & fitness", "Fitness", "food"),
    "07": ("Brain dump", "Thoughts, memories & Ask Tempo", "brain"),
    "08": ("Getting started", "Onboarding & settings", "overview"),
}

CSS = """
:root{color-scheme:light;--ink:#302b35;--muted:#706979;--line:#e2dce5;--accent:#744e86;--paper:#fffefb}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:30px}body{margin:0;background:#f6f3f6;color:var(--ink);font:16px/1.75 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:#684278;text-underline-offset:4px}a:hover{color:#442653}a:focus-visible,button:focus-visible{outline:3px solid #8a63a0;outline-offset:5px}.skip{position:fixed;left:16px;top:-70px;z-index:20;padding:12px;background:white}.skip:focus{top:12px}.sidebar{position:fixed;inset:0 auto 0 0;width:276px;padding:34px 22px;background:#fffefc;border-right:1px solid var(--line);overflow:auto}.brand{display:block;font:500 30px/1.1 Georgia,serif;letter-spacing:-1px;margin-bottom:8px}.brand small{font:11px/1.4 system-ui,sans-serif;letter-spacing:2px;text-transform:uppercase;display:block;color:var(--muted);margin-top:12px}.sidebar-date{font-size:12px;color:var(--muted);padding-bottom:22px;margin-bottom:20px;border-bottom:1px solid var(--line)}nav{display:grid;gap:6px}nav a{display:flex;gap:11px;align-items:flex-start;padding:10px 12px;border:1px solid transparent;border-radius:9px;text-decoration:none;color:#5b5462;font-size:13px;line-height:1.5}nav a span{color:#9b8fa3;font-size:11px;line-height:1.9;font-variant-numeric:tabular-nums}nav a:hover,nav a[aria-current=true]{background:#f3edf7;border-color:#e5daed;color:#4e305e}.sidebar-note{font-size:12px;color:var(--muted);padding:22px 12px;line-height:1.7}.sidebar-note a{display:block;margin-top:8px}.main{margin-left:276px;padding:48px clamp(25px,4vw,70px) 80px;max-width:1600px}.hero{max-width:1000px;margin:0 auto 36px}.eyebrow{font-size:11px;font-weight:650;letter-spacing:2px;text-transform:uppercase;color:#795b89}.hero h1{font:500 clamp(37px,4.4vw,64px)/1.06 Georgia,serif;letter-spacing:-1.8px;margin:16px 0 24px;max-width:820px}.intro{font-size:18px;line-height:1.75;max-width:760px;color:#6b6172;margin:0 0 28px}.meta{display:flex;gap:9px;flex-wrap:wrap}.meta span{font-size:12px;border:1px solid #ded5e5;background:#fffafc;border-radius:24px;padding:5px 12px}.swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:32px 0}.swatch{padding:16px;border:1px solid;border-radius:13px;line-height:1.5}.swatch:before{content:'';display:block;width:26px;height:5px;background:currentColor;border-radius:6px;margin-bottom:14px}.swatch strong{display:block;font-size:14px}.swatch small{display:block;font-size:11px;margin-top:5px;opacity:.8}.planner{--family:#f7f5ef;--family-border:#dedbd2;--family-ink:#3f3b36}.rhythm{--family:#fff8ec;--family-border:#eadbbd;--family-ink:#4c3825}.food{--family:#edf5fc;--family-border:#cddfed;--family-ink:#294a66}.brain{--family:#f6f3fc;--family-border:#ded5ed;--family-ink:#352c49}.overview{--family:#f1edf5;--family-border:#ded5e5;--family-ink:#594367}.swatch{background:var(--family);border-color:var(--family-border);color:var(--family-ink)}.evidence-warning{border:1px solid #ded2c1;background:#fff9ed;border-radius:14px;padding:22px 24px;margin:0 auto 38px;max-width:1000px}.evidence-warning h2{font-size:15px;margin:0 0 10px}.evidence-warning p{font-size:13px;color:#6e604b;margin:0;line-height:1.8}.legend{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.legend span{background:#fff;border:1px solid #e7dfd2;border-radius:6px;padding:5px 10px;font-size:11px;color:#665946}.report{max-width:1000px;background:var(--paper);border:1px solid var(--family-border);border-radius:19px;margin:0 auto 34px;overflow:hidden;box-shadow:0 6px 24px #30243a03;scroll-margin-top:24px}.report-header{padding:28px 36px;background:var(--family);border-bottom:1px solid var(--family-border)}.report-kicker{font-size:11px;font-weight:650;letter-spacing:1.6px;text-transform:uppercase;color:var(--family-ink);opacity:.8}.report-header h2{font:500 clamp(27px,3vw,36px)/1.2 Georgia,serif;color:var(--family-ink);margin:10px 0 14px;letter-spacing:-.5px}.source-link{font-size:11px;color:#746a7c}.report-body{padding:14px 36px 34px}.report-body h3{font-size:19px;line-height:1.4;margin:30px 0 14px;padding-top:4px;color:#39303f}.report-body h4{font-size:16px;margin:24px 0 12px}.report-body p,.report-body li{font-size:15px;line-height:1.85;color:#5c5363;overflow-wrap:anywhere}.report-body p{margin:17px 0}.report-body strong{color:#3f3447;font-weight:650}.report-body ul,.report-body ol{padding-left:24px;margin:18px 0}.report-body li{padding-left:7px;margin:12px 0}.report-body code{font:12px/1.6 ui-monospace,Consolas,monospace;background:#f2eff4;padding:3px 5px;border-radius:4px;color:#6d487f;overflow-wrap:anywhere}.report-body pre{white-space:pre-wrap;padding:18px;background:#f2eff4;border-radius:10px}.report-body pre code{background:none;padding:0}.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:26px 0}.evidence-grid:has(figure:only-child){grid-template-columns:1fr}figure{min-width:0;margin:0;border:1px solid #e3dde6;border-radius:12px;overflow:hidden;background:#f7f5f8}.image-link{display:block;background:#ece8ee;line-height:0}.image-link img{display:block;width:100%;height:260px;object-fit:contain;background:#eeeaf0}.evidence-grid:has(figure:only-child) img{height:auto;max-height:580px;object-fit:contain}figcaption{padding:13px 15px;font-size:11px;line-height:1.6;color:#716478;display:flex;gap:8px;flex-wrap:wrap}.caption-mark{font-size:15px}.full-image{display:block;font-size:10px;opacity:.7;margin-left:auto}blockquote{margin:20px 0;padding:14px 20px;border-left:3px solid #b79ac7;background:#f8f4fb;font-size:14px;color:#64506f}.table-wrap{overflow-x:auto}table{border-collapse:collapse;min-width:450px;width:100%;font-size:13px}th,td{border:1px solid #e2dbe7;padding:12px;text-align:left}th{background:#f4eff7}hr{border:0;border-top:1px solid var(--line);margin:28px 0}.footer{max-width:1000px;margin:42px auto 0;color:#887b91;font-size:12px;text-align:center}.back-top{display:inline-block;margin-top:9px}.supplement h3{margin-top:22px}.report-body>.evidence-grid:first-child{margin-top:20px}@media(max-width:1000px){.sidebar{width:230px;padding:28px 16px}.main{margin-left:230px;padding:34px 24px 60px}.report-header{padding:24px}.report-body{padding:10px 24px 28px}.swatches{grid-template-columns:repeat(2,minmax(0,1fr))}.image-link img{height:200px}}@media(max-width:720px){html{scroll-padding-top:16px}.sidebar{position:static;width:auto;border-right:0;border-bottom:1px solid var(--line);padding:22px}.brand{font-size:26px}.brand small{display:inline;margin-left:15px}.sidebar-date{margin:12px 0;padding-bottom:12px}nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}nav a{padding:8px;font-size:12px}.sidebar-note{display:none}.main{margin-left:0;padding:28px 16px 45px}.hero h1{font-size:41px;letter-spacing:-1px}.intro{font-size:16px}.swatches{margin:24px 0;gap:9px}.evidence-warning{padding:18px}.report-header{padding:22px 20px}.report-body{padding:6px 20px 24px}.evidence-grid{grid-template-columns:1fr}.image-link img{height:auto;max-height:520px}.report-header h2{font-size:28px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.sidebar,.skip,.back-top{display:none}.main{margin:0;padding:0}.report{box-shadow:none;break-inside:auto;border-radius:0}.report-header{break-after:avoid}.evidence-grid{break-inside:avoid}.image-link img{max-height:350px}.hero h1{font-size:36px}body{background:white}.report-body a{color:inherit}}
"""


def main() -> None:
    copied_reports = OUTPUT.parent / "reports"
    copied_reports.mkdir(parents=True, exist_ok=True)
    articles = []
    nav = []
    for path in FILES:
        markdown = path.read_text(encoding="utf-8")
        title = next((line[2:].strip() for line in markdown.splitlines() if line.startswith("# ")), path.stem)
        number = path.name[:2]
        family, short_title, tone = LABELS.get(number, ("Research", title, "overview"))
        report_id = slug(path)
        nav.append(f'<a href="#{report_id}"><span>{number}</span>{html.escape(short_title)}</a>')
        def local_source_image(match: re.Match[str]) -> str:
            filename = Path(unquote(match[2].strip("<>")).replace("\\", "/")).name
            if (OUTPUT.parent / filename).is_file():
                return f"![{match[1]}](../{quote(filename)})"
            return match[0]

        copied_markdown = re.sub(r"!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)", local_source_image, markdown)
        (copied_reports / path.name).write_text(copied_markdown, encoding="utf-8")
        source_url = quote("reports/" + path.name)
        articles.append(f'<article class="report {tone}" id="{report_id}"><header class="report-header"><div class="report-kicker">Study {number} / {html.escape(family)}</div><h2>{html.escape(title)}</h2><a class="source-link" href="{source_url}" target="_blank" rel="noopener">Read source report ↗</a></header><div class="report-body">{render(markdown, path)}</div></article>')
    supplements = []
    for filename, caption in [
        ("food-05-myfitnesspal-today-guide.jpg", "MyFitnessPal official public Today guide — published help imagery; authenticated diary untested"),
        ("food-06-myfitnesspal-meal-macros.jpg", "MyFitnessPal official public meal-macros guide — published help imagery; authenticated diary untested"),
    ]:
        if filename not in REFERENCED_IMAGES and (OUTPUT.parent / filename).is_file():
            supplements.append(figure(caption, filename, REPORTS / "04-nutrition-tracker.md"))
    if supplements:
        nav.append('<a href="#supplement"><span>+</span>Additional official evidence</a>')
        articles.append('<article class="report food supplement" id="supplement"><header class="report-header"><div class="report-kicker">Food & fitness / Supplement</div><h2>Additional official evidence</h2></header><div class="report-body"><p>New public guide captures, available alongside the report. These are official published visuals, not screenshots of an authenticated personal diary. No MyFitnessPal sign-in was performed.</p><div class="evidence-grid">' + "".join(supplements) + '</div></div></article>')
    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempo — Design research gallery · October 15, 2026</title><style>{CSS}</style></head>
<body><a class="skip" href="#research">Skip to research</a><aside class="sidebar"><div class="brand">Tempo<small>Research notebook</small></div><div class="sidebar-date">October 15, 2026 · Local review</div><nav aria-label="Research studies">{''.join(nav)}</nav><div class="sidebar-note">Evidence first. Each study keeps its observed steps, interpretation, implementation brief, and limits together.<a href="#evidence">How to read this research</a></div></aside>
<main class="main" id="research"><header class="hero" id="top"><div class="eyebrow">Tempo / Product design research</div><h1>A calmer place<br>to bring the day together.</h1><p class="intro">A visual notebook of the products, flows, and practical patterns informing Tempo’s next design pass. Read the evidence, see the references, and trace each proposed change back to its source.</p><div class="meta"><span>{len(FILES)} complete reports</span><span>Official sources linked</span><span>Original captures preserved</span><span>Research ≠ release approval</span></div><div class="swatches" aria-label="Proposed family palettes"><div class="swatch planner"><strong>Planner</strong><small>Quiet working sheet</small></div><div class="swatch rhythm"><strong>Daily rhythm</strong><small>Warm amber ritual</small></div><div class="swatch food"><strong>Food & fitness</strong><small>Clear blue diary</small></div><div class="swatch brain"><strong>Brain dump</strong><small>Lavender & paper notes</small></div></div></header>
<section class="evidence-warning" id="evidence" aria-labelledby="evidence-title"><h2 id="evidence-title">Read the evidence at the right level</h2><p>Official screenshots in marketing pages and help guides show published product visuals. Anonymous interactions show only the public controls actually exercised. Authenticated workflows remain untested unless a report explicitly records otherwise. No account creation, personal diary access, or competitor performance ranking is implied. Implementation notes describe a first pass and its stated checks; they do not establish production readiness.</p><div class="legend"><span>Published official visual</span><span>Anonymous interaction</span><span>Authenticated: untested</span><span>User reference: separately identified</span></div></section>
{''.join(articles)}<footer class="footer">Tempo design research · October 15, 2026 · Source reports remain the record of evidence.<br><a class="back-top" href="#top">Back to the notebook ↑</a></footer></main>
<script>const links=[...document.querySelectorAll('nav a')];const sections=[...document.querySelectorAll('.report')];if('IntersectionObserver'in window){{const observer=new IntersectionObserver(entries=>{{for(const entry of entries){{if(entry.isIntersecting){{for(const link of links){{if(link.hash==='#'+entry.target.id)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}}}}}}}},{{rootMargin:'-10% 0px -65% 0px',threshold:0}});sections.forEach(section=>observer.observe(section));}}</script></body></html>'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"Rendered {len(FILES)} reports with {len(REFERENCED_IMAGES)} local screenshots to {OUTPUT}")


if __name__ == "__main__":
    main()
