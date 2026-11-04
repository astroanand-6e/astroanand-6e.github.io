"""Generates local-llm-roundup-2026-11.html from models.json. Run: python3 build.py"""
import html
import json
from pathlib import Path

HERE = Path(__file__).parent
SKILLS = ["reasoning", "coding", "instruction_following", "multimodal", "speed_edge", "creative_writing"]
SKILL_LABELS = ["Reasoning", "Coding", "Instr.", "Multimodal", "Edge", "Creative"]
# Map axes: x = edge-friendliness, y = mean of capability skills.
MAP_W, MAP_H, PAD = 640, 420, 48
POINT_R = 12

esc = html.escape


def dots(v):
    if v is None:
        return '<span class="np">n/a</span>'
    return f'<span class="dots" role="img" aria-label="{v} of 5">{"●" * v}{"○" * (5 - v)}</span>'


def short(model_id):
    return model_id.split("/")[1].replace("-GGUF", "")


def bench_cell(b):
    shown = [(k, v) for k, v in b.items() if v not in ("n/p",) and not str(v).startswith("n/p")]
    if not shown:
        return '<span class="np">none published</span>'
    return "<br>".join(f"{esc(k.replace('_', ' '))}: <b>{esc(str(v))}</b>" for k, v in shown[:5])


def capability(m):
    vals = [m["ratings"][s] for s in SKILLS if s != "speed_edge" and m["ratings"][s] is not None]
    return sum(vals) / len(vals)


def skill_map(models):
    pts, legend, placed = [], [], []
    for i, m in enumerate(models, 1):
        legend.append(f'<li><b>{i}</b> {esc(short(m["id"]))}</li>')
        if m["ratings"]["speed_edge"] is None:
            continue  # no edge rating to place it by; it stays in the legend
        x = PAD + (m["ratings"]["speed_edge"] - 1) / 4 * (MAP_W - 2 * PAD)
        y = MAP_H - PAD - (capability(m) - 1) / 4 * (MAP_H - 2 * PAD)
        # Nudge right until the point clears every point already placed.
        while any(abs(x - px) < 2 * POINT_R and abs(y - py) < 2 * POINT_R for px, py in placed):
            x += 2 * POINT_R + 2
        placed.append((x, y))
        pts.append(
            f'<circle class="pt" cx="{x:.0f}" cy="{y:.0f}" r="{POINT_R}"/>'
            f'<text x="{x:.0f}" y="{y + 4.5:.0f}" text-anchor="middle" class="n">{i}</text>'
        )
    axes = (
        f'<line x1="{PAD}" y1="{MAP_H - PAD}" x2="{MAP_W - PAD}" y2="{MAP_H - PAD}"/>'
        f'<line x1="{PAD}" y1="{PAD}" x2="{PAD}" y2="{MAP_H - PAD}"/>'
        f'<text x="{MAP_W / 2}" y="{MAP_H - 12}" text-anchor="middle" class="ax">edge-friendliness →</text>'
        f'<text x="14" y="{MAP_H / 2}" transform="rotate(-90 14 {MAP_H / 2})" text-anchor="middle" class="ax">breadth of capability →</text>'
    )
    return (
        f'<div class="map-scroll" tabindex="0" role="region" aria-label="Skill map"><svg class="skill-map" viewBox="0 0 {MAP_W + 60} {MAP_H}" role="img" '
        f'aria-label="Models placed by edge-friendliness and capability">{axes}{"".join(pts)}</svg></div>'
        f'<ol class="map-legend">{"".join(legend)}</ol>'
    )


def model_card(m):
    reddit = [u for u in m["links"] if "reddit" in u]
    label = lambda u: (f"r/LocalLLaMA #{reddit.index(u) + 1}" if len(reddit) > 1 else "r/LocalLLaMA") if u in reddit else esc(u.split("//")[1].split("/")[0])
    links = "".join(f'<a href="{esc(u)}">{label(u)}</a>' for u in m["links"])
    org, name = m["id"].split("/", 1)
    return f"""
<article class="card" id="{esc(short(m['id']))}">
  <h3><span class="org">{esc(org)}/</span>{esc(name)}</h3>
  <p class="meta">{esc(m['params'])} · {esc(m['modality'])} · {esc(m['license'])}</p>
  <p>{esc(m['take'])}</p>
  <p class="quote">Community verdict: {esc(m['reddit_summary'])}</p>
  <p class="links">{links}</p>
</article>"""


def build():
    data = json.loads((HERE / "models.json").read_text())
    models = data["models"]
    head_cells = "".join(f"<th>{l}</th>" for l in SKILL_LABELS)
    skill_rows = "".join(
        f'<tr><td><a href="#{esc(short(m["id"]))}">{esc(short(m["id"]))}</a></td>'
        + "".join(f"<td>{dots(m['ratings'][s])}</td>" for s in SKILLS) + "</tr>"
        for m in models
    )
    bench_rows = "".join(
        f'<tr><td>{esc(short(m["id"]))}</td><td class="num">{esc(m["params"])}</td>'
        f'<td>{esc(m["modality"])}</td><td>{bench_cell(m["benchmarks"])}</td></tr>'
        for m in models
    )
    tpl = (HERE / "template.html").read_text()
    out = (tpl.replace("{{SKILL_HEAD}}", head_cells).replace("{{SKILL_ROWS}}", skill_rows)
              .replace("{{BENCH_ROWS}}", bench_rows).replace("{{MAP}}", skill_map(models))
              .replace("{{CARDS}}", "".join(model_card(m) for m in models)))
    (HERE / "local-llm-roundup-2026-11.html").write_text(out)


if __name__ == "__main__":
    build()
