import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useGSTIN, useIFSC, useINR, usePAN, usePhone, usePincode, useUPILink } from "../src/react";

function GSTINDemo() {
  const g = useGSTIN();
  return (
    <section>
      <h2>GSTIN</h2>
      <label htmlFor="gstin">GSTIN (try 27AAPFU0939F1ZV, or the UN body UIN 2317UNO00001UND)</label>
      <input id="gstin" {...g.inputProps} data-valid={g.isValid || undefined} data-invalid={g.error ? "" : undefined} />
      <div className="err">{g.error}</div>
      {g.details && (
        <dl>
          <dt>Type</dt><dd>{g.details.typeLabel}</dd>
          <dt>State</dt><dd>{g.details.stateName} ({g.details.stateCode})</dd>
          {g.details.pan && <><dt>PAN</dt><dd>{g.details.pan}</dd></>}
          {g.details.panHolderType && <><dt>Holder</dt><dd>{g.details.panHolderType}</dd></>}
          {g.details.tan && <><dt>TAN</dt><dd>{g.details.tan}</dd></>}
          {g.details.countryCode && <><dt>Country / org</dt><dd>{g.details.countryCode} (registered 20{g.details.registrationYear})</dd></>}
        </dl>
      )}
    </section>
  );
}

function PANDemo() {
  const p = usePAN();
  return (
    <section>
      <h2>PAN</h2>
      <label htmlFor="pan">PAN (try ABCPE1234F)</label>
      <input id="pan" {...p.inputProps} data-valid={p.isValid || undefined} data-invalid={p.error ? "" : undefined} />
      <div className="err">{p.error}</div>
      {p.details && <div className="ok">Holder type: {p.details.holderType}</div>}
    </section>
  );
}

function IFSCDemo() {
  const f = useIFSC();
  return (
    <section>
      <h2>IFSC + live branch lookup</h2>
      <label htmlFor="ifsc">IFSC (try HDFC0000240)</label>
      <input id="ifsc" {...f.inputProps} data-valid={f.isValid || undefined} data-invalid={f.error ? "" : undefined} />
      <div className="err">{f.error ?? f.lookupError}</div>
      {f.lookupStatus === "loading" && <div>Looking up…</div>}
      {f.branch && (
        <dl>
          <dt>Bank</dt><dd>{f.branch.bank}</dd>
          <dt>Branch</dt><dd>{f.branch.branch}</dd>
          <dt>City</dt><dd>{f.branch.city}, {f.branch.state}</dd>
          <dt>Supports</dt><dd>{["UPI", "NEFT", "RTGS", "IMPS"].filter((k) => f.branch![k.toLowerCase() as "upi"]).join(" · ")}</dd>
        </dl>
      )}
    </section>
  );
}

function ContactDemo() {
  const phone = usePhone();
  const pin = usePincode({ lookup: true });
  return (
    <section>
      <h2>Mobile & PIN code</h2>
      <label htmlFor="phone">Mobile</label>
      <input id="phone" {...phone.inputProps} data-valid={phone.isValid || undefined} data-invalid={phone.error ? "" : undefined} />
      <div className="err">{phone.error}</div>
      {phone.details && <div className="ok">E.164: {phone.details.e164}</div>}
      <label htmlFor="pin">PIN code (try 560001)</label>
      <input id="pin" {...pin.inputProps} data-valid={pin.isValid || undefined} data-invalid={pin.error ? "" : undefined} />
      <div className="err">{pin.error || pin.lookupError}</div>
      {pin.lookupStatus === "loading" && <div>Looking up…</div>}
      {pin.location && (
        <dl>
          <dt>District</dt><dd>{pin.location.district}</dd>
          <dt>State</dt><dd>{pin.location.state}</dd>
          <dt>Post offices</dt><dd>{pin.location.postOffices.map((o) => o.name).join(", ")}</dd>
        </dl>
      )}
      {!pin.location && pin.details && <div className="ok">{pin.details.zone} zone</div>}
    </section>
  );
}

function UPIDemo() {
  const [vpa, setVpa] = useState("shop@okhdfcbank");
  const [amount, setAmount] = useState("499");
  const { link, error } = useUPILink({ payeeAddress: vpa, payeeName: "Demo Shop", amount: amount || undefined, note: "Order 1042" });
  return (
    <section>
      <h2>UPI payment link + QR</h2>
      <label htmlFor="vpa">Payee UPI ID</label>
      <input id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} />
      <label htmlFor="amt">Amount (₹)</label>
      <input id="amt" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
      <div className="err">{error}</div>
      {link && (
        <div className="qr">
          <QRCodeSVG value={link} size={120} />
          <code>{link}</code>
        </div>
      )}
    </section>
  );
}

function INRDemo() {
  const [amount, setAmount] = useState("1234567.89");
  const inr = useINR(amount);
  return (
    <section>
      <h2>₹ formatting</h2>
      <label htmlFor="inr">Amount</label>
      <input id="inr" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="big" style={{ marginTop: 12 }}>{inr.formatted}</div>
      <div>{inr.compact}</div>
      <div style={{ fontSize: 13, color: "#57534e", marginTop: 6 }}>{inr.words}</div>
    </section>
  );
}

function App() {
  return (
    <main>
      <h1>indiakit-js</h1>
      <p className="sub">Validators, formatters and headless React hooks for Indian apps. Unstyled — this page's CSS is the demo's, not the library's.</p>
      <p className="links">
        <code>npm i indiakit-js</code>
        <a href="https://www.npmjs.com/package/indiakit-js">npm</a>
        <a href="https://github.com/StanPrajwal/indiakit-js">GitHub</a>
        <a href="https://github.com/StanPrajwal/indiakit-js#readme">Docs</a>
      </p>
      <div className="grid">
        <GSTINDemo />
        <IFSCDemo />
        <UPIDemo />
        <INRDemo />
        <PANDemo />
        <ContactDemo />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
