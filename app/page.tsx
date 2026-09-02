'use client';

import { SubmitEvent, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITEKEY = '0x4AAAAAAEkBOL5vfjKvsY3F';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: 'dark';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'timeout-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type RegistrationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; username: string }
  | { status: 'error'; message: string };

type ServerState = 'checking' | 'online' | 'offline';

export default function Home() {
  const [registration, setRegistration] = useState<RegistrationState>({ status: 'idle' });
  const [serverState, setServerState] = useState<ServerState>('checking');
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileTokenField = useRef<HTMLInputElement>(null);

  function updateTurnstileToken(token: string) {
    setTurnstileToken(token);
    if (turnstileTokenField.current) {
      turnstileTokenField.current.value = token;
    }
  }

  async function copyRealmlist() {
    await navigator.clipboard.writeText('set realmlist swarena.swami.dev');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  useEffect(() => {
    let active = true;

    async function checkServer() {
      try {
        const response = await fetch('/api/v1/server/status', { cache: 'no-store' });
        const payload = (await response.json()) as { online?: boolean };
        if (active) setServerState(response.ok && payload.online ? 'online' : 'offline');
      } catch {
        if (active) setServerState('offline');
      }
    }

    void checkServer();
    const interval = window.setInterval(checkServer, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    function renderTurnstile() {
      if (!active || !window.turnstile || !turnstileContainer.current) return;
      if (turnstileWidgetId.current) return;

      turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: TURNSTILE_SITEKEY,
        action: 'signup',
        theme: 'dark',
        callback: updateTurnstileToken,
        'expired-callback': () => updateTurnstileToken(''),
        'timeout-callback': () => updateTurnstileToken(''),
        'error-callback': () => updateTurnstileToken(''),
      });
    }

    const script = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`,
    );
    if (script) {
      script.addEventListener('load', renderTurnstile);
      renderTurnstile();
    }

    return () => {
      active = false;
      script?.removeEventListener('load', renderTurnstile);
    };
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = form.get('password');
    const passwordConfirmation = form.get('passwordConfirmation');

    if (password !== passwordConfirmation) {
      setRegistration({ status: 'error', message: 'passwords do not match.' });
      return;
    }

    if (!turnstileToken) {
      setRegistration({ status: 'error', message: 'complete the human verification.' });
      return;
    }

    setRegistration({ status: 'loading' });

    try {
      const response = await fetch('/api/v1/accounts/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          email: form.get('email'),
          password,
          turnstileToken,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        username?: string;
        code?: string;
      };

      if (!response.ok) {
        const messages: Record<string, string> = {
          ACCOUNT_ALREADY_EXISTS: 'that account name is already in use.',
          REGISTRATION_DISABLED: 'registration is temporarily closed.',
          DATABASE_UNAVAILABLE: 'the server is currently unavailable.',
          VALIDATION_ERROR: 'check the information you entered.',
          TURNSTILE_VERIFICATION_FAILED: 'human verification failed. please try again.',
        };
        throw new Error(
          (payload.code && messages[payload.code]) ??
            'the account could not be created.',
        );
      }

      formElement.reset();
      setRegistration({ status: 'success', username: payload.username ?? '' });
    } catch (error) {
      setRegistration({
        status: 'error',
        message: error instanceof Error ? error.message : 'the account could not be created.',
      });
    } finally {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
      updateTurnstileToken('');
    }
  }

  const statusText = {
    checking: 'checking…',
    online: 'online',
    offline: 'offline',
  }[serverState];

  return (
    <main className="swarena-site">
      <header className="site-header">
        <div className="nav-shell">
          <a className="brand-mark" href="#create-account" aria-label="swarena home">
            <span>swarena</span>
          </a>

          <nav className="primary-nav" aria-label="primary navigation">
            <a href="#create-account">create account</a>
            <span className="nav-placeholder" aria-disabled="true">download</span>
            <a href="https://discord.gg/y2uvRWC9tk" target="_blank" rel="noreferrer">discord</a>
            <span className="leaderboard-link" aria-disabled="true">
              leaderboard
              <small>coming soon</small>
            </span>
          </nav>

          <output className="server-menu-status" aria-label={`server status: ${statusText}`}>
            <span className={`status-pixel status-${serverState}`} aria-hidden="true" />
            <span>{statusText}</span>
          </output>
        </div>
      </header>

      <div className="site-content">
        <section id="create-account" className="account-panel" aria-labelledby="registration-title">
          <div className="panel-heading">
            <span aria-hidden="true" />
            <h1 id="registration-title">create account</h1>
            <span aria-hidden="true" />
          </div>
          <div className="form-pane">
            <form onSubmit={handleSubmit}>
              <div className="swarena-field">
                <label htmlFor="username">account name:</label>
                <div className="field-control">
                  <input id="username" name="username" type="text" autoComplete="username" required minLength={3} maxLength={17} pattern="[A-Za-z0-9]+" />
                  <small>3–17 letters or numbers.</small>
                </div>
              </div>

              <div className="swarena-field">
                <label htmlFor="email">email address:</label>
                <div className="field-control">
                  <input id="email" name="email" type="email" autoComplete="email" required maxLength={255} />
                </div>
              </div>

              <div className="swarena-field">
                <label htmlFor="password">password:</label>
                <div className="field-control">
                  <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={16} pattern="[\x21-\x7E]+" />
                  <small>8–16 characters, without spaces.</small>
                </div>
              </div>

              <div className="swarena-field">
                <label htmlFor="password-confirmation">confirm password:</label>
                <div className="field-control">
                  <input id="password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={16} pattern="[\x21-\x7E]+" />
                  <small>repeat the same password.</small>
                </div>
              </div>

              <div className="turnstile-row">
                <div ref={turnstileContainer} aria-label="human verification" />
                <input ref={turnstileTokenField} type="hidden" name="turnstileToken" defaultValue="" />
              </div>

              {registration.status === 'success' && (
                <output className="form-message success-message">
                  account {registration.username} created successfully.
                </output>
              )}
              {registration.status === 'error' && (
                <div className="form-message error-message" role="alert">
                  {registration.message}
                </div>
              )}

              <div className="submit-row">
                <button
                  type="submit"
                  className="submit-button"
                  disabled={registration.status === 'loading' || !turnstileToken}
                >
                  {registration.status === 'loading' ? 'creating…' : 'create'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <footer className="swarena-footer">
        <code>set realmlist swarena.swami.dev</code>
        <button
          type="button"
          className="icon-button"
          onClick={copyRealmlist}
          aria-label={copied ? 'copied' : 'copy realmlist'}
          title={copied ? 'copied' : 'copy realmlist'}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
      </footer>
    </main>
  );
}
