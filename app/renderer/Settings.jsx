import React from "react";
export function Settings({
  theme,
  onThemeChange,
  vimEnabled,
  onToggleVim,
  disabled,
}) {
  return (
    <div className="settings-page">
      <div className="settings-content">
        <div className="settings-eyebrow">PREFERENCES</div>
        <h1>Settings</h1>
        <p className="settings-intro">Personalize your workspace.</p>
        <section className="settings-section">
          <h2>Appearance</h2>
          <p>Choose a color theme for the interface and editor.</p>
          <div
            className="theme-options"
            role="radiogroup"
            aria-label="Color theme"
          >
            {["dark", "light"].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                className={`theme-option ${theme === value ? "selected" : ""}`}
                disabled={disabled}
                onClick={() => onThemeChange(value)}
              >
                <span className={`theme-preview ${value}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span>{value === "dark" ? "Dark" : "Light"}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h2>Editor</h2>
          <label className="setting-line">
            <span>
              <strong>Vim mode</strong>
              <small>Use Vim keybindings in the code editor.</small>
            </span>
            <input
              type="checkbox"
              checked={vimEnabled}
              disabled={disabled}
              onChange={onToggleVim}
            />
          </label>
        </section>
      </div>
    </div>
  );
}
