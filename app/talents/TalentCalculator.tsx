'use client';

import { RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import talentData from './talents.generated.json';

type Rank = { spellId: number; name: string; rank: string; description: string };
type Talent = {
  id: number;
  treeId: number;
  row: number;
  column: number;
  iconId: number;
  iconUrl: string;
  name: string;
  prerequisiteId: number | null;
  prerequisiteRank: number;
  ranks: Rank[];
};
type TalentTree = { id: number; name: string; talents: Talent[] };
type GameClass = { id: string; name: string; color: string; trees: TalentTree[] };
type Allocation = Record<number, number>;

const data = talentData as {
  maxPoints: number;
  source: { commit: string };
  classes: GameClass[];
};

function talentInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function pointsInTree(tree: TalentTree, allocation: Allocation) {
  return tree.talents.reduce((total, talent) => total + (allocation[talent.id] ?? 0), 0);
}

function pointsBelowRow(tree: TalentTree, row: number, allocation: Allocation) {
  return tree.talents
    .filter((talent) => talent.row < row)
    .reduce((total, talent) => total + (allocation[talent.id] ?? 0), 0);
}

function isAllocationValid(gameClass: GameClass, allocation: Allocation) {
  return gameClass.trees.every((tree) =>
    tree.talents.every((talent) => {
      const rank = allocation[talent.id] ?? 0;
      if (!rank) return true;
      const tierUnlocked = pointsBelowRow(tree, talent.row, allocation) >= talent.row * 5;
      const prerequisiteMet =
        !talent.prerequisiteId ||
        (allocation[talent.prerequisiteId] ?? 0) >= talent.prerequisiteRank;
      return tierUnlocked && prerequisiteMet;
    }),
  );
}

export default function TalentCalculator() {
  const [classId, setClassId] = useState(data.classes[0].id);
  const [allocations, setAllocations] = useState<Record<string, Allocation>>({});
  const [focusedTalentId, setFocusedTalentId] = useState<number | null>(null);

  const gameClass = data.classes.find((item) => item.id === classId) ?? data.classes[0];
  const allocation = allocations[gameClass.id] ?? {};
  const allTalents = useMemo(
    () => gameClass.trees.flatMap((tree) => tree.talents),
    [gameClass],
  );
  const focusedTalent =
    allTalents.find((talent) => talent.id === focusedTalentId) ?? allTalents[0];
  const totalSpent = Object.values(allocation).reduce((total, rank) => total + rank, 0);

  function updateAllocation(next: Allocation) {
    setAllocations((current) => ({ ...current, [gameClass.id]: next }));
  }

  function addPoint(tree: TalentTree, talent: Talent) {
    setFocusedTalentId(talent.id);
    const currentRank = allocation[talent.id] ?? 0;
    if (currentRank >= talent.ranks.length || totalSpent >= data.maxPoints) return;
    if (pointsBelowRow(tree, talent.row, allocation) < talent.row * 5) return;
    if (
      talent.prerequisiteId &&
      (allocation[talent.prerequisiteId] ?? 0) < talent.prerequisiteRank
    ) return;
    updateAllocation({ ...allocation, [talent.id]: currentRank + 1 });
  }

  function removePoint(talent: Talent) {
    setFocusedTalentId(talent.id);
    const currentRank = allocation[talent.id] ?? 0;
    if (!currentRank) return;
    const next = { ...allocation, [talent.id]: currentRank - 1 };
    if (!next[talent.id]) delete next[talent.id];
    if (isAllocationValid(gameClass, next)) updateAllocation(next);
  }

  function selectClass(nextClassId: string) {
    setClassId(nextClassId);
    setFocusedTalentId(null);
  }

  const focusedRank = allocation[focusedTalent.id] ?? 0;
  const currentDescription = focusedRank ? focusedTalent.ranks[focusedRank - 1]?.description : '';
  const nextDescription = focusedTalent.ranks[focusedRank]?.description;

  return (
    <div className="talent-calculator" style={{ '--class-color': gameClass.color } as React.CSSProperties}>
      <div className="talent-toolbar">
        <div className="class-selector" role="tablist" aria-label="class">
          {data.classes.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={item.id === gameClass.id}
              className={item.id === gameClass.id ? 'class-tab class-tab-active' : 'class-tab'}
              style={{ '--tab-color': item.color } as React.CSSProperties}
              key={item.id}
              onClick={() => selectClass(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="point-summary" aria-live="polite">
          <strong>{totalSpent}</strong> / {data.maxPoints} points
          <button
            type="button"
            className="reset-talents"
            onClick={() => updateAllocation({})}
            disabled={!totalSpent}
            title={`reset ${gameClass.name} talents`}
          >
            <RotateCcw aria-hidden="true" /> reset
          </button>
        </div>
      </div>

      <p className="talent-help">left click to add · right click to remove</p>

      <div className="talent-workspace">
        <div className="talent-trees">
          {gameClass.trees.map((tree) => {
            const rowCount = Math.max(...tree.talents.map((talent) => talent.row)) + 1;
            return (
            <section className="talent-tree" key={tree.id} aria-labelledby={`tree-${tree.id}`}>
              <header>
                <h2 id={`tree-${tree.id}`}>{tree.name}</h2>
                <span>{pointsInTree(tree, allocation)} points</span>
              </header>
              <div
                className="talent-grid"
                style={{ '--talent-rows': rowCount } as React.CSSProperties}
              >
                {Array.from({ length: rowCount * 4 }, (_, slot) => {
                  const row = Math.floor(slot / 4);
                  const column = slot % 4;
                  const talent = tree.talents.find(
                    (candidate) => candidate.row === row && candidate.column === column,
                  );
                  if (!talent) return <span className="talent-slot-empty" key={slot} />;

                  const rank = allocation[talent.id] ?? 0;
                  const maxRank = talent.ranks.length;
                  const canAdd =
                    rank < maxRank &&
                    totalSpent < data.maxPoints &&
                    pointsBelowRow(tree, talent.row, allocation) >= talent.row * 5 &&
                    (!talent.prerequisiteId ||
                      (allocation[talent.prerequisiteId] ?? 0) >= talent.prerequisiteRank);
                  const stateClass = rank === maxRank ? ' talent-maxed' : canAdd ? ' talent-ready' : '';

                  return (
                    <button
                      type="button"
                      key={talent.id}
                      className={`talent-node${stateClass}${focusedTalent.id === talent.id ? ' talent-focused' : ''}`}
                      onClick={() => addPoint(tree, talent)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        removePoint(talent);
                      }}
                      onFocus={() => setFocusedTalentId(talent.id)}
                      onMouseEnter={() => setFocusedTalentId(talent.id)}
                      aria-label={`${talent.name}, rank ${rank} of ${maxRank}`}
                      title={`${talent.name} (${rank}/${maxRank})`}
                    >
                      <span className="talent-glyph" style={{ '--icon-hue': talent.iconId % 360 } as React.CSSProperties}>
                        {talentInitials(talent.name)}
                        <Image src={talent.iconUrl} alt="" width={38} height={38} aria-hidden="true" />
                      </span>
                      <span className="talent-rank">{rank}/{maxRank}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>

        <aside className="talent-details" aria-live="polite">
          <span className="talent-details-kicker">selected talent</span>
          <h2>{focusedTalent.name}</h2>
          <p className="talent-details-rank">rank {focusedRank} / {focusedTalent.ranks.length}</p>
          {currentDescription && (
            <div className="talent-description">
              <strong>current rank</strong>
              <p>{currentDescription}</p>
            </div>
          )}
          {nextDescription ? (
            <div className="talent-description talent-description-next">
              <strong>next rank</strong>
              <p>{nextDescription}</p>
            </div>
          ) : (
            <p className="talent-complete">maximum rank reached.</p>
          )}
          {focusedTalent.row > 0 && (
            <p className="talent-requirement">requires {focusedTalent.row * 5} points in this tree.</p>
          )}
          <small>source: swarena-game {data.source.commit.slice(0, 7)}</small>
        </aside>
      </div>
    </div>
  );
}
