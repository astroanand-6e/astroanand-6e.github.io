"""Rebuilds the post list in blog/index.html from the posts' own <head> tags.

Add a post: copy blog/posts/_starter.html to blog/posts/<slug>.html, fill in
its {{PLACEHOLDERS}} and write it, then run:  python3 blog/build_index.py

The list reads four tags from each post:
  og:title                  title
  description               summary under the title
  article:published_time    YYYY-MM-DD; sets the order and the year group
  article:tag               topic label
Reading time is counted from the prose in <main> (tables and charts skipped).
Files that still hold {{PLACEHOLDERS}}, like the starter and generator
templates, aren't posts and are skipped.
"""
import html
import re
from dataclasses import dataclass
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

BLOG = Path(__file__).resolve().parent
POSTS = BLOG / "posts"
INDEX = BLOG / "index.html"
START, END = "<!-- posts:start -->", "<!-- posts:end -->"
REQUIRED = ("og:title", "description", "article:published_time", "article:tag")
PLACEHOLDER = re.compile(r"\{\{[A-Z][A-Z_]*\}\}")
WORDS_PER_MINUTE = 230
UNCOUNTED = {"script", "style", "svg", "table", "pre"}
INDENT = " " * 6
ARROW = (
    '<svg class="post-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 15.5 15.5 4.5M7 4.5h8.5V13"/></svg>'
)

esc = html.escape


@dataclass(frozen=True)
class Post:
    href: str
    title: str
    summary: str
    published: date
    topic: str
    minutes: int


class PostReader(HTMLParser):
    """Collects <meta> tags and counts the words of prose inside <main>."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.words = 0
        self._main = 0
        self._uncounted = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = attrs.get("property") or attrs.get("name")
        if tag == "meta" and key:
            self.meta[key] = (attrs.get("content") or "").strip()
        elif tag == "main":
            self._main += 1
        elif tag in UNCOUNTED:
            self._uncounted += 1

    def handle_endtag(self, tag):
        if tag == "main":
            self._main = max(0, self._main - 1)
        elif tag in UNCOUNTED:
            self._uncounted = max(0, self._uncounted - 1)

    def handle_data(self, data):
        if self._main and not self._uncounted:
            self.words += len(data.split())


def read_post(path):
    text = path.read_text(encoding="utf-8")
    if PLACEHOLDER.search(text):
        print(f"skipped {path.name}: unfilled {{{{PLACEHOLDERS}}}}")
        return None
    reader = PostReader()
    reader.feed(text)
    missing = [key for key in REQUIRED if not reader.meta.get(key)]
    if missing:
        raise SystemExit(f"{path.name}: add <meta> tags for {', '.join(missing)}")
    try:
        published = date.fromisoformat(reader.meta["article:published_time"][:10])
    except ValueError:
        raise SystemExit(f"{path.name}: article:published_time must be YYYY-MM-DD") from None
    return Post(
        href=f"/blog/posts/{path.name}",
        title=reader.meta["og:title"],
        summary=reader.meta["description"],
        published=published,
        topic=reader.meta["article:tag"],
        minutes=max(1, round(reader.words / WORDS_PER_MINUTE)),
    )


def render_item(post):
    day = f"{post.published:%b} {post.published.day}"
    return "\n".join((
        f'{INDENT}    <li class="post-item">',
        f'{INDENT}      <h3 class="post-item-title"><a href="{esc(post.href)}">{esc(post.title)}</a></h3>',
        f'{INDENT}      <p class="mono post-item-meta"><time datetime="{post.published.isoformat()}">{day}</time>'
        f'<span class="post-item-topic">{esc(post.topic)}</span><span>{post.minutes} min read</span></p>',
        f'{INDENT}      <p class="post-item-summary">{esc(post.summary)}</p>',
        f'{INDENT}      {ARROW}',
        f'{INDENT}    </li>',
    ))


def render(posts):
    if not posts:
        return f'{INDENT}<p class="blog-empty">No posts yet.</p>'
    sections = []
    for year in sorted({p.published.year for p in posts}, reverse=True):
        items = "\n".join(render_item(p) for p in posts if p.published.year == year)
        sections.append("\n".join((
            f'{INDENT}<section class="year" aria-labelledby="y{year}">',
            f'{INDENT}  <h2 class="year-label" id="y{year}">{year}</h2>',
            f'{INDENT}  <ol class="post-list">',
            items,
            f'{INDENT}  </ol>',
            f'{INDENT}</section>',
        )))
    return "\n".join(sections)


def build():
    found = (read_post(path) for path in sorted(POSTS.glob("*.html")))
    posts = sorted((p for p in found if p), key=lambda p: (-p.published.toordinal(), p.title))
    page = INDEX.read_text(encoding="utf-8")
    head, has_start, rest = page.partition(START)
    _, has_end, tail = rest.partition(END)
    if not (has_start and has_end):
        raise SystemExit(f"{INDEX.name}: missing the {START} and {END} markers")
    INDEX.write_text(f"{head}{START}\n{render(posts)}\n{INDENT}{END}{tail}", encoding="utf-8")
    print(f"blog/index.html: {len(posts)} post(s) listed")


if __name__ == "__main__":
    build()
