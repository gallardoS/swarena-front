'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

type ArenaBracket = '2v2' | '3v3' | '5v5';

type ArenaTeamMember = {
  name: string;
  classId: number;
  personalRating: number;
};

type ArenaTeam = {
  position: number;
  name: string;
  rating: number;
  seasonGames: number;
  seasonWins: number;
  seasonLosses: number;
  winRate: number;
  members: ArenaTeamMember[];
};

type LeaderboardResponse = {
  bracket: ArenaBracket;
  teams: ArenaTeam[];
};

type LeaderboardState =
  | { status: 'loading' }
  | { status: 'success'; teams: ArenaTeam[] }
  | { status: 'error' };

const BRACKETS: ArenaBracket[] = ['2v2', '3v3', '5v5'];

const CLASS_NAMES: Record<number, string> = {
  1: 'warrior',
  2: 'paladin',
  3: 'hunter',
  4: 'rogue',
  5: 'priest',
  6: 'death knight',
  7: 'shaman',
  8: 'mage',
  9: 'warlock',
  11: 'druid',
};

const CLASS_ICONS: Record<number, string> = {
  1: '/class-icons/warrior.png',
  2: '/class-icons/paladin.png',
  3: '/class-icons/hunter.png',
  4: '/class-icons/rogue.png',
  5: '/class-icons/priest.png',
  6: '/class-icons/deathknight.png',
  7: '/class-icons/shaman.png',
  8: '/class-icons/mage.png',
  9: '/class-icons/warlock.png',
  11: '/class-icons/druid.png',
};

export default function ArenaLeaderboard() {
  const [bracket, setBracket] = useState<ArenaBracket>('2v2');
  const [state, setState] = useState<LeaderboardState>({ status: 'loading' });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const cache = useRef(new Map<ArenaBracket, ArenaTeam[]>());

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    current: ArenaBracket,
  ) {
    const currentIndex = BRACKETS.indexOf(current);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight')
      nextIndex = (currentIndex + 1) % BRACKETS.length;
    if (event.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + BRACKETS.length) % BRACKETS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = BRACKETS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextBracket = BRACKETS[nextIndex];
    setBracket(nextBracket);
    document.getElementById(`bracket-tab-${nextBracket}`)?.focus();
  }

  useEffect(() => {
    const cachedTeams = cache.current.get(bracket);
    if (cachedTeams) {
      setState({ status: 'success', teams: cachedTeams });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });

    async function loadLeaderboard() {
      try {
        const response = await fetch(
          `/api/v1/leaderboards/arenas?bracket=${encodeURIComponent(bracket)}&limit=20`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(`Leaderboard request failed with ${response.status}`);

        const payload = (await response.json()) as LeaderboardResponse;
        cache.current.set(bracket, payload.teams);
        setState({ status: 'success', teams: payload.teams });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setState({ status: 'error' });
      }
    }

    void loadLeaderboard();
    return () => controller.abort();
  }, [bracket, retryAttempt]);

  return (
    <div className="leaderboard-pane">
      <div className="bracket-tabs" role="tablist" aria-label="arena bracket">
        {BRACKETS.map((candidate) => (
          <button
            key={candidate}
            id={`bracket-tab-${candidate}`}
            type="button"
            role="tab"
            aria-selected={bracket === candidate}
            aria-controls="arena-leaderboard-results"
            tabIndex={bracket === candidate ? 0 : -1}
            onClick={() => setBracket(candidate)}
            onKeyDown={(event) => handleTabKeyDown(event, candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>

      <div
        id="arena-leaderboard-results"
        className="leaderboard-results"
        role="tabpanel"
        aria-labelledby={`bracket-tab-${bracket}`}
        aria-busy={state.status === 'loading'}
      >
        {state.status === 'loading' && (
          <p className="leaderboard-message" aria-live="polite">
            loading leaderboard…
          </p>
        )}

        {state.status === 'error' && (
          <div className="leaderboard-message" role="alert">
            <p>the leaderboard is temporarily unavailable.</p>
            <button
              type="button"
              className="leaderboard-retry"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
            >
              retry
            </button>
          </div>
        )}

        {state.status === 'success' && state.teams.length === 0 && (
          <p className="leaderboard-message">
            no teams have played in this bracket yet.
          </p>
        )}

        {state.status === 'success' && state.teams.length > 0 && (
          <div className="leaderboard-table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th scope="col">rank</th>
                  <th scope="col">rating</th>
                  <th scope="col">team</th>
                  <th scope="col">members</th>
                  <th scope="col">W/L</th>
                  <th scope="col">win%</th>
                </tr>
              </thead>
              <tbody>
                {state.teams.map((team) => (
                  <tr key={`${bracket}-${team.position}-${team.name}`}>
                    <td className="leaderboard-rank">#{team.position}</td>
                    <td className="leaderboard-rating">{team.rating}</td>
                    <th scope="row">{team.name}</th>
                    <td>
                      <div className="arena-members">
                        {team.members.map((member) => {
                          const className =
                            CLASS_NAMES[member.classId] ?? 'unknown';
                          const classIcon = CLASS_ICONS[member.classId];
                          return (
                            <span
                              key={member.name}
                              className={`arena-member class-${member.classId}`}
                              title={`${className} · ${member.personalRating} personal rating`}
                            >
                              {classIcon && (
                                <Image
                                  src={classIcon}
                                  alt=""
                                  aria-hidden="true"
                                  width={28}
                                  height={28}
                                />
                              )}
                              <span>
                                {member.name}
                                <small>
                                  {className} · {member.personalRating}
                                </small>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      {team.seasonWins}/{team.seasonLosses}
                    </td>
                    <td>{team.winRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
