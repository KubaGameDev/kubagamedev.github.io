"use strict";
(() => {
  const storageKey = "c_welcome";
  const list = document.getElementById("comments");
  const form = document.getElementById("notes-form");
  const status = document.getElementById("notes-status");
  let notes = [];
  let canSave = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved) || saved.some(note => !note || typeof note.text !== "string")) {
      throw new Error("Unrecognised notes");
    }
    notes = saved;
  } catch {
    canSave = false;
    status.textContent = "Saved notes could not be read. Your existing storage has not been changed.";
  }
  function render() {
    list.replaceChildren();
    notes.forEach(note => {
      const article = document.createElement("article");
      article.className = "saved-note";
      const author = document.createElement("strong");
      author.textContent = typeof note.name === "string" ? note.name : "Anonymous";
      const date = document.createElement("p");
      date.className = "muted";
      date.textContent = typeof note.date === "string" ? note.date : "";
      const text = document.createElement("p");
      // Treat saved input as text, including notes saved by the old page.
      text.textContent = note.text;
      article.append(author, date, text);
      list.append(article);
    });
  }
  render();
  form.addEventListener("submit", event => {
    event.preventDefault();
    const text = document.getElementById("comment-input").value.trim();
    if (!text) { status.textContent = "Write a note before saving."; return; }
    if (!canSave) { status.textContent = "Notes cannot be saved while browser storage is unavailable or unreadable."; return; }
    const next = [...notes, {
      name: document.getElementById("name-input").value.trim() || "Anonymous",
      text,
      date: new Date().toLocaleString()
    }];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      notes = next;
      document.getElementById("comment-input").value = "";
      render();
      status.textContent = "Saved in this browser on this device.";
    } catch {
      status.textContent = "Your note could not be saved. Copy it somewhere safe and check your browser storage settings.";
    }
  });
})();
