try {
  const d = await fetch("/api/config").then((r) => r.json());
  const s = Object.fromEntries(
    d.settings.map((x) => [
      x.setting_key,
      typeof x.setting_value === "string"
        ? x.setting_value
        : JSON.stringify(x.setting_value),
    ]),
  );
  for (const key of ["terms", "privacy"])
    if (s[key]) {
      const p = document.createElement("p");
      p.textContent = s[key];
      document.querySelector("#" + key).append(p);
    }
  if (s.company_address || s.support_email || s.support_phone)
    document.querySelector("#contact").textContent = [
      s.site_name,
      s.company_address,
      s.support_email,
      s.support_phone,
    ]
      .filter(Boolean)
      .join(" · ");
} catch {}
