export default function About() {
  return (
    <div style={{ background: "#f7f5f0", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: "#2d2d2d" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 32px 80px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#c9a84c", textTransform: "uppercase", marginBottom: 8 }}>
            Studio Andreas · Internal Documentation
          </p>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#1a1a2e", margin: 0, lineHeight: 1.15 }}>
            Payroll System Admin Guide
          </h1>
          <p style={{ marginTop: 12, fontSize: 16, color: "#666", lineHeight: 1.6 }}>
            Complete reference for managing instructor payroll via Acuity Scheduling, Google Sheets, and Claude Desktop.
          </p>
        </div>

        {/* Section 01 — System Overview */}
        <Section number="01" title="System Overview">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
            The Studio Andreas payroll system automates instructor compensation every two weeks. It pulls session data
            directly from Acuity Scheduling, sends each instructor a personalized confirmation form, and syncs their
            responses back to Google Sheets — ready for payroll processing.
          </p>

          {/* Three component boxes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Acuity Scheduling", desc: "Source of truth for instructor sessions and class data" },
              { label: "Claude Desktop", desc: "Automated engine: detects pay period, sends forms, tracks responses" },
              { label: "Google Sheets", desc: "Output hub: pay rates, confirmation status, and payroll review" },
            ].map((c) => (
              <div key={c.label} style={{ background: "#1a1a2e", borderRadius: 8, padding: "20px 16px", borderTop: "3px solid #c9a84c" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#c9a84c", textTransform: "uppercase", marginBottom: 8 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.55 }}>{c.desc}</div>
              </div>
            ))}
          </div>

          <Callout>
            <strong>Pay Period Cycle:</strong> Runs every 2 weeks. Pay periods are pre-defined in the Google Sheet's "Pay Periods" tab.
          </Callout>
        </Section>

        {/* Section 02 — The Full Workflow */}
        <Section number="02" title="The Full Workflow">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 28, color: "#666" }}>
            The complete bi-weekly payroll cycle — from end of pay period to payment.
          </p>

          {/* Flow steps */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 32, flexWrap: "wrap" }}>
            {[
              { n: "1", label: "Pay Period\nEnds", auto: false },
              { n: "2", label: "Admin Says\n\"Send Forms\"", auto: false },
              { n: "3", label: "Claude Fetches\nSessions & Emails", auto: true },
              { n: "4", label: "Instructors\nReview & Submit", auto: false },
              { n: "5", label: "Sheet Updates\nAutomatically", auto: true },
              { n: "6", label: "Admin Reviews\n& Pays", auto: false },
            ].map((step, i, arr) => (
              <div key={step.n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ position: "relative" }}>
                  {step.auto && (
                    <div style={{
                      position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
                      background: "#c9a84c", color: "#1a1a2e", fontSize: 9, fontWeight: 800,
                      letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap"
                    }}>AUTO</div>
                  )}
                  <div style={{
                    background: "#1a1a2e", borderRadius: 8, padding: "12px 14px", textAlign: "center",
                    minWidth: 90, border: step.auto ? "2px solid #c9a84c" : "2px solid #333"
                  }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#c9a84c", color: "#1a1a2e", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px" }}>{step.n}</div>
                    <div style={{ fontSize: 11, color: "#fff", lineHeight: 1.4, whiteSpace: "pre-line" }}>{step.label}</div>
                  </div>
                </div>
                {i < arr.length - 1 && <div style={{ color: "#c9a84c", fontSize: 18, fontWeight: 300, marginTop: 8 }}>→</div>}
              </div>
            ))}
          </div>

          {/* Two-column admin vs auto */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#1a1a2e", padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#fff" }}>What the Admin Does</div>
              <ul style={{ margin: 0, padding: "16px 16px 16px 32px", fontSize: 13, lineHeight: 2, color: "#2d2d2d" }}>
                {["Open Claude Desktop", "Type: \"Send forms to all instructors\"", "Confirm the pay period Claude found", "Wait for instructors to submit", "Open the Payroll tab in Google Sheets", "Review TRUE / DISPUTED entries", "Process payroll"].map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#c9a84c", padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>What Happens Automatically</div>
              <ul style={{ margin: 0, padding: "16px 16px 16px 32px", fontSize: 13, lineHeight: 2, color: "#2d2d2d" }}>
                {["Detects the current pay period from the sheet", "Fetches all sessions from Acuity Scheduling", "Generates a unique form link per instructor", "Emails each instructor their personal link", "Receives form submissions in real time", "Updates the Payroll sheet automatically", "Marks confirmed & disputed sessions"].map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        {/* Section 03 — Sending Payroll Forms */}
        <Section number="03" title="Sending Payroll Forms">
          {/* Command callout */}
          <div style={{ background: "#1a1a2e", borderRadius: 10, padding: "20px 24px", marginBottom: 32 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", color: "#c9a84c", textTransform: "uppercase", marginBottom: 6 }}>Command</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              "Send the payroll forms to all instructors"
            </div>
            <div style={{ fontSize: 13, color: "#888" }}>Or any natural language variation — Claude understands the intent.</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { n: 1, title: "Open Claude Desktop", desc: "Launch the Claude Desktop app on your computer." },
              { n: 2, title: "Type your request", desc: "Use natural language — no need to specify the pay period number. Claude auto-detects it from the Google Sheet." },
              { n: 3, title: "Confirm what Claude found", desc: "Claude will report back: which pay period it detected, the date range, and the list of instructors it will email." },
              { n: 4, title: "Forms are sent", desc: "Each instructor receives a personalized email with a unique link. No logins or passwords required for them." },
              { n: 5, title: "Done — wait for submissions", desc: "The Google Sheet updates automatically as instructors respond. Nothing else needed from you." },
            ].map((step, i, arr) => (
              <div key={step.n} style={{ display: "flex", gap: 16, paddingBottom: i < arr.length - 1 ? 0 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#c9a84c", color: "#1a1a2e", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step.n}</div>
                  {i < arr.length - 1 && <div style={{ width: 2, flex: 1, background: "#e0d9ce", margin: "4px 0" }} />}
                </div>
                <div style={{ paddingBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 3 }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 04 — The Google Sheet */}
        <Section number="04" title="The Google Sheet">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 24, color: "#666" }}>
            Three tabs — each plays a distinct role in the payroll system.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              { tab: "Pay Periods", color: "#1a1a2e", accent: "#c9a84c", items: ["Pre-loaded payroll schedule", "Defines all 2-week periods", "Read-only — do not edit", "Claude reads this to detect the current period"] },
              { tab: "Instructors", color: "#1a1a2e", accent: "#c9a84c", items: ["Source of truth for all staff", "Edit: Include in Payroll (Yes / No)", "Edit: Tech Hours Rate ($/hr)", "To deactivate: change Yes → No"] },
              { tab: "Payroll", color: "#1a1a2e", accent: "#c9a84c", items: ["Auto-fills after submissions", "TRUE = session confirmed", "DISPUTED = instructor flagged", "Tech Hours appear below each instructor's Acuity sessions"] },
            ].map((t) => (
              <div key={t.tab} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: t.color, borderBottom: `3px solid ${t.accent}`, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#fff" }}>{t.tab}</div>
                <ul style={{ margin: 0, padding: "12px 16px 12px 28px", fontSize: 12.5, lineHeight: 1.9, color: "#444" }}>
                  {t.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <Callout>
            <strong>Fields you can (and should) edit:</strong> In the Instructors tab — "Include in Payroll" (Yes or No) and "Tech Hours Rate" (dollar amount per hour). Changes take effect immediately at the next payroll run — no restart required.
          </Callout>
        </Section>

        {/* Section 05 — The Instructor Experience */}
        <Section number="05" title="The Instructor Experience">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 24, color: "#666" }}>
            What instructors see and do — understanding their flow helps you support them.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { title: "No Login Required", desc: "Each email contains a unique personal link. Instructors tap it and go straight to their form." },
              { title: "Sessions Pre-Filled", desc: "All Acuity sessions for the pay period are listed and pre-checked — nothing to enter manually." },
              { title: "Dispute a Session", desc: "Unchecking a session flags it as DISPUTED in the sheet. A running count is shown on the form." },
              { title: "Add Tech Hours", desc: "Off-schedule work (meetings, prep, admin) can be added with date, type, hours, and notes." },
              { title: "Overall Notes", desc: "A free-text field for anything they want the admin to know about that pay period." },
              { title: "Mobile Friendly", desc: "The form works in any browser on phone, tablet, or desktop — no app needed." },
            ].map((card) => (
              <div key={card.title} style={{ background: "#fff", border: "1px solid #e5e0d8", borderLeft: "3px solid #c9a84c", borderRadius: "0 8px 8px 0", padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Section 06 — Managing Instructors */}
        <Section number="06" title="Managing Instructors & Pay Rates">
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 24, color: "#666" }}>
            All instructor configuration lives in the Instructors tab of the Google Sheet.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { title: "Change a Pay Rate", desc: "Open the Instructors tab. Find the instructor's row. Edit the \"Tech Hours Rate\" column. The new rate takes effect immediately at the next payroll run — no save or restart needed." },
              { title: "Exclude an Instructor from Payroll", desc: "In the Instructors tab, find the instructor and change \"Include in Payroll\" from Yes to No. They will be skipped the next time forms are sent. Change back to Yes to re-include them." },
              { title: "About Mark Andreas (Owner)", desc: "Mark is excluded via the Instructors tab — his 'Include in Payroll' is set to No by default. Do not change this setting." },
              { title: "Adding a New Instructor", desc: "Add a new row to the Instructors tab with their name, email, and pay rate. Set Include in Payroll to Yes. They will be picked up automatically at the next payroll run." },
            ].map((item) => (
              <div key={item.title} style={{ background: "#fff", border: "1px solid #e5e0d8", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: "#1a1a2e", padding: "9px 16px", fontSize: 12, fontWeight: 700, color: "#c9a84c", letterSpacing: "0.03em" }}>{item.title}</div>
                <div style={{ padding: "12px 16px", fontSize: 13.5, color: "#444", lineHeight: 1.7 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, background: "#1a1a2e", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ background: "#c9a84c", padding: "12px 20px", fontSize: 26, fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>{number}</div>
        <div style={{ padding: "12px 20px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#f0ead8", border: "1px solid #e0d4b0", borderRadius: 8, padding: "14px 18px", fontSize: 13.5, lineHeight: 1.7, color: "#3a3220" }}>
      {children}
    </div>
  );
}
