import syntraLogo from '../../img/Syntra Logo.jpg';

interface LandingProps {
  onEnter: () => void;
}

const FEATURES = [
  {
    icon: '🤖',
    title: 'Multi-model chat',
    text: 'One workspace for OpenAI, Anthropic, DeepSeek, and Gemini. Pick a model or let capability-based routing choose the best fit.',
  },
  {
    icon: '⚡',
    title: 'Streaming responses',
    text: 'Answers stream token by token over SSE. Stop generation any time — partial answers are kept.',
  },
  {
    icon: '🧠',
    title: 'Agents with guardrails',
    text: 'Coding, research, document, and writing agents run inside permission policies with tool budgets and human approval gates.',
  },
  {
    icon: '📄',
    title: 'Document intelligence',
    text: 'Upload PDF, DOCX, or text and get summaries, extraction, and answers grounded in your files.',
  },
  {
    icon: '🔒',
    title: 'Your data stays yours',
    text: 'Per-user isolation, server-side entitlements, and provider keys that never touch the browser.',
  },
  {
    icon: '📊',
    title: 'Usage you can trust',
    text: 'Real token accounting and cost rollups per model — the same numbers the platform enforces.',
  },
];

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    tagline: 'Try the platform',
    features: ['100 requests / month', '200K tokens / month', '2 efficient models', '5 file uploads', 'All five agents'],
    cta: 'Start free',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$20',
    period: '/month',
    tagline: 'For daily drivers',
    features: [
      '2,000 requests / month',
      '5M tokens / month',
      'All models, all providers',
      '200 file uploads',
      'Priority routing',
    ],
    cta: 'Choose Pro',
    highlight: true,
  },
  {
    key: 'team',
    name: 'Team',
    price: '$60',
    period: '/month',
    tagline: 'For small teams',
    features: [
      '10,000 requests / month',
      '25M tokens / month',
      'All models, all providers',
      '1,000 file uploads',
      'Room for shared workspaces',
    ],
    cta: 'Choose Team',
    highlight: false,
  },
];

const MODEL_PROVIDERS = ['OpenAI', 'Anthropic', 'DeepSeek', 'Gemini'];

export default function Landing({ onEnter }: LandingProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src={syntraLogo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          <span className="text-lg font-bold tracking-tight">Syntra</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
          <a href="#features" className="hover:text-slate-200">Features</a>
          <a href="#providers" className="hover:text-slate-200">Models</a>
          <a href="#pricing" className="hover:text-slate-200">Pricing</a>
        </nav>
        <button
          onClick={onEnter}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center md:pt-24">
        <p className="mb-4 inline-block rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
          Provider-neutral AI platform · Phase 1
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
          One workspace.
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
            Every AI model.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-400 md:text-lg">
          Syntra unifies chat, coding, research, documents, and writing agents behind one interface —
          with model routing, usage limits, and guardrails that keep you in control.
          Your data, your rules; the models are interchangeable.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={onEnter}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold hover:bg-indigo-500 sm:w-auto"
          >
            Create your workspace
          </button>
          <a
            href="#pricing"
            className="w-full rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-900 sm:w-auto"
          >
            See pricing
          </a>
        </div>
        <p className="mt-4 text-xs text-slate-500">Free tier included · No credit card</p>
      </section>

      {/* Model providers strip */}
      <section id="providers" className="border-y border-slate-800 bg-slate-900/40 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 text-sm text-slate-500">
          <span className="text-xs uppercase tracking-wider">Models from</span>
          {MODEL_PROVIDERS.map((p) => (
            <span key={p} className="font-semibold text-slate-300">{p}</span>
          ))}
          <span className="text-xs text-slate-500">— switchable per message, no code changes</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">Built for real work</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400">
          Everything below runs on the Syntra backend — models are just providers.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="text-2xl" aria-hidden="true">{f.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-800 bg-slate-900/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">Simple pricing</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-400">
            Entitlements are enforced server-side — what you see here is exactly what the platform applies.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-6 ${
                  plan.highlight
                    ? 'border-indigo-500 bg-indigo-950/20 shadow-lg shadow-indigo-950/40'
                    : 'border-slate-800 bg-slate-900/50'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold">
                    Most popular
                  </span>
                )}
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-slate-500">{plan.period}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{plan.tagline}</p>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <span className="mt-0.5 text-indigo-400" aria-hidden="true">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onEnter}
                  className={`mt-8 w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
                    plan.highlight
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-slate-500">
            Limits reset with each monthly billing period. Team workspaces and consolidated billing arrive in a later release.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-600">
        Syntra — provider-neutral multi-model platform · Prompts and files are processed by the selected model provider under its terms.
      </footer>
    </div>
  );
}
