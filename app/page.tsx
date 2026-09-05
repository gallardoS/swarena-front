'use client';

import { SubmitEvent, useEffect, useRef, useState } from 'react';
import { Check, Copy, Menu, X } from 'lucide-react';
import TalentCalculator from './talents/TalentCalculator';

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
      size: 'flexible' | 'compact';
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
type ActivePanel = 'create-account' | 'download' | 'talents';

const CLIENT_DOWNLOAD_URL =
  'https://drive.google.com/file/d/13WdW1357px5UZY4jPeCWm4Zjq3dy1JQJ/view?usp=sharing';

export default function Home() {
  const [activePanel, setActivePanel] = useState<ActivePanel>('create-account');
  const [registration, setRegistration] = useState<RegistrationState>({ status: 'idle' });
  const [serverState, setServerState] = useState<ServerState>('checking');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tutorialCopied, setTutorialCopied] = useState(false);
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

  async function copyTutorialRealmlist() {
    await navigator.clipboard.writeText('set realmlist swarena.swami.dev');
    setTutorialCopied(true);
    window.setTimeout(() => setTutorialCopied(false), 1500);
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

      const size = turnstileContainer.current.clientWidth < 300 ? 'compact' : 'flexible';

      turnstileWidgetId.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: TURNSTILE_SITEKEY,
        action: 'signup',
        theme: 'dark',
        size,
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
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={mobileMenuOpen ? 'close navigation menu' : 'open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <a
            className="brand-mark"
            href="#create-account"
            aria-label="swarena home"
            onClick={() => {
              setActivePanel('create-account');
              setMobileMenuOpen(false);
            }}
          >
            <span>swarena</span>
          </a>

          <nav
            id="primary-navigation"
            className={`primary-nav${mobileMenuOpen ? ' mobile-open' : ''}`}
            aria-label="primary navigation"
          >
            <a href="#create-account" onClick={() => {
              setActivePanel('create-account');
              setMobileMenuOpen(false);
            }}>
              create account
            </a>
            <a href="#download" onClick={() => {
              setActivePanel('download');
              setMobileMenuOpen(false);
            }}>
              download
            </a>
            <button className="leaderboard-link" type="button" aria-disabled="true">
              leaderboard
              <span className="nav-tooltip" role="tooltip">coming soon</span>
            </button>
            <a href="#talents" onClick={() => {
              setActivePanel('talents');
              setMobileMenuOpen(false);
            }}>
              talents
            </a>
          </nav>

          <div className="header-actions">
            <a
              className="discord-link"
              href="https://discord.gg/y2uvRWC9tk"
              target="_blank"
              rel="noreferrer"
              aria-label="join the SWArena Discord"
              title="Discord"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19.54 5.34A17 17 0 0 0 15.44 4l-.5 1.02a15.5 15.5 0 0 0-5.86 0L8.56 4a17 17 0 0 0-4.1 1.35C1.86 9.2 1.16 12.94 1.51 16.62a16.6 16.6 0 0 0 5.03 2.54l1.23-1.68a10.8 10.8 0 0 1-1.93-.93l.48-.37c3.72 1.72 7.76 1.72 11.43 0l.49.37c-.62.36-1.27.67-1.94.93l1.23 1.68a16.5 16.5 0 0 0 5.03-2.54c.42-4.27-.72-7.97-3.02-11.28ZM8.52 14.35c-1.12 0-2.04-1.03-2.04-2.29 0-1.26.9-2.3 2.04-2.3 1.14 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.29-2.04 2.29Zm6.96 0c-1.12 0-2.04-1.03-2.04-2.29 0-1.26.9-2.3 2.04-2.3 1.14 0 2.06 1.04 2.04 2.3 0 1.26-.9 2.29-2.04 2.29Z" />
              </svg>
            </a>
            <output className="server-menu-status" aria-label={`server status: ${statusText}`}>
              <span className={`status-pixel status-${serverState}`} aria-hidden="true" />
              <span>{statusText}</span>
            </output>
          </div>
        </div>
      </header>

      <div className="site-content">
        <section
          id="create-account"
          className={`account-panel${activePanel === 'create-account' ? '' : ' panel-hidden'}`}
          aria-labelledby="registration-title"
        >
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

        <section
          id="download"
          className={`account-panel download-panel${activePanel === 'download' ? '' : ' panel-hidden'}`}
          aria-labelledby="download-title"
        >
          <div className="panel-heading">
            <span aria-hidden="true" />
            <h1 id="download-title">download</h1>
            <span aria-hidden="true" />
          </div>

          <div className="download-pane">
            <div className="download-action">
              <h2>download 3.3.5 client</h2>
              <a
                className="submit-button download-button"
                href={CLIENT_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                download
              </a>
            </div>

            <div className="download-divider" aria-hidden="true" />

            <div className="tutorial-pane">
              <h2>tutorial</h2>
              <ol>
                <li>download the client</li>
                <li>
                  <span className="tutorial-command">
                    <code>set realmlist swarena.swami.dev</code>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={copyTutorialRealmlist}
                      aria-label={tutorialCopied ? 'copied' : 'copy realmlist'}
                      title={tutorialCopied ? 'copied' : 'copy realmlist'}
                    >
                      {tutorialCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </button>
                  </span>
                </li>
                <li>
                  <a href="#create-account" onClick={() => setActivePanel('create-account')}>
                    create account
                  </a>
                </li>
                <li>play</li>
              </ol>
            </div>
          </div>
        </section>

        <section
          id="talents"
          className={`account-panel talents-panel${activePanel === 'talents' ? '' : ' panel-hidden'}`}
          aria-labelledby="talents-title"
        >
          <div className="panel-heading">
            <span aria-hidden="true" />
            <h1 id="talents-title">talent calculator</h1>
            <span aria-hidden="true" />
          </div>
          <TalentCalculator />
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
