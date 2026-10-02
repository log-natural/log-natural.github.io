const BASE = location.pathname.endsWith("/")
  ? location.pathname
  : location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1);

const DATA_BASE = "./";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

async function getJson(path) {
  const response = await fetch(`./${path}?v=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json();
}

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: markdown };

  const data = {};
  let currentList = null;

  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const listMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (listMatch) {
      currentList = [];
      data[listMatch[1]] = currentList;
      continue;
    }

    const itemMatch = line.match(/^\s*-\s*(.*)$/);
    if (itemMatch && currentList) {
      currentList.push(itemMatch[1].replace(/^['"]|['"]$/g, ""));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentList = null;
      let value = kv[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if ((value.startsWith("[") && value.endsWith("]"))) {
        try { value = JSON.parse(value.replace(/'/g, '"')); } catch {}
      }
      data[kv[1]] = value;
    }
  }

  return { data, body: markdown.slice(match[0].length) };
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let code = [];

  const closeList = () => {
    if (inList) { html += "</ul>"; inList = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      closeList();
      if (!inCode) {
        inCode = true;
        code = [];
      } else {
        html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
        inCode = false;
      }
      continue;
    }
    if (inCode) { code.push(line); continue; }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      closeList();
      html += `<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}" loading="lazy"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      continue;
    }

    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (list) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMarkdown(list[1])}</li>`;
      continue;
    }

    if (line.startsWith("> ")) {
      closeList();
      html += `<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`;
      continue;
    }

    closeList();
    html += `<p>${inlineMarkdown(line)}</p>`;
  }

  closeList();
  return html;
}

async function loadProfile() {
  const profile = await getJson("./data/profile.json");
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("profile-name", profile.name);
  setText("profile-role", profile.role);
  setText("profile-bio", profile.bio);
  setText("profile-interests", profile.interests);

  const image = document.getElementById("profile-image");
  if (image) {
    image.src = profile.image;
    image.alt = `${profile.name} 프로필 이미지`;
  }

  const stack = document.getElementById("profile-stack");
  if (stack) stack.innerHTML = (profile.stack || [])
    .map(item => `<span>${escapeHtml(item)}</span>`).join("");

  const socials = document.getElementById("social-links");
  if (socials) socials.innerHTML = Object.entries(profile.socials || {})
    .map(([name, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`)
    .join("");
}

async function loadProjects() {
  const entries = await getJson("./data/projects.json");
  const projects = await Promise.all(entries.map(async entry => {
    const response = await fetch(`./${entry.file}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${entry.file}: ${response.status}`);
    }

    const markdown = await response.text();
    const parsed = parseFrontMatter(markdown);
    return { ...entry, ...parsed.data, body: parsed.body };
  }));

  projects.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const grid = document.getElementById("project-grid");
  if (grid) {
    grid.innerHTML = projects.map(project => `
      <a class="project-card" href="./project.html?slug=${encodeURIComponent(project.slug)}">
        <div class="project-thumb">
          <img src="${escapeHtml(project.thumbnail || "assets/project-placeholder.svg")}" alt="" loading="lazy">
        </div>
        <div class="project-card-body">
          <div class="project-card-top">
            <span class="category">${escapeHtml(project.category || "Project")}</span>
            <time>${escapeHtml(project.date || "")}</time>
          </div>
          <h3>${escapeHtml(project.title || project.slug)}</h3>
          <p>${escapeHtml(project.description || "")}</p>
          <div class="tags">${(project.tags || []).map(tag => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </a>
    `).join("");
    document.getElementById("project-count").textContent = `${projects.length} projects`;
    document.getElementById("empty-state").hidden = projects.length > 0;
  }

  const slug = new URLSearchParams(location.search).get("slug");
  if (slug) {
    const project = projects.find(item => item.slug === slug);
    renderProject(project);
  }
}

function renderProject(project) {
  const root = document.getElementById("project-detail");
  if (!root) return;

  if (!project) {
    root.innerHTML = `<div class="not-found"><h1>Project not found</h1><a href="./">Back to projects</a></div>`;
    return;
  }

  document.title = `${project.title} · Portfolio`;

  root.innerHTML = `
    <header class="article-header">
      <div class="article-meta">
        <span>${escapeHtml(project.category || "Project")}</span>
        <time>${escapeHtml(project.date || "")}</time>
      </div>
      <h1>${escapeHtml(project.title)}</h1>
      <p>${escapeHtml(project.description || "")}</p>
      <div class="tags">${(project.tags || []).map(tag => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
    </header>
    <div class="article-cover">
      <img src="${escapeHtml(project.thumbnail || "assets/project-placeholder.svg")}" alt="" loading="lazy">
    </div>
    <article class="markdown-body">${markdownToHtml(project.body || "")}</article>
  `;
}

async function init() {
  try {
    if (document.getElementById("profile-image")) await loadProfile();
    await loadProjects();
  } catch (error) {
    console.error(error);
    const root = document.getElementById("project-grid") || document.getElementById("project-detail");
    if (root) root.innerHTML = `<div class="error-box">콘텐츠를 불러오지 못했습니다. GitHub Pages에서 직접 열어 주세요.</div>`;
  }
}

init();
