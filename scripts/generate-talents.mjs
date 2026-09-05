import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const GAME_REPOSITORY = process.argv[2] ?? process.env.SWARENA_GAME_PATH;

if (!GAME_REPOSITORY) {
  throw new Error(
    'Pass the swarena-game path: npm run generate:talents -- "C:\\path\\to\\swarena-game"',
  );
}

const TALENT_PATH = path.join(GAME_REPOSITORY, 'env', 'custom-dbc', 'Talent.dbc');
const SPELL_PATH = path.join(GAME_REPOSITORY, 'env', 'custom-dbc', 'Spell.dbc');
const OUTPUT_PATH = path.resolve('app', 'talents', 'talents.generated.json');
const ICON_OUTPUT_PATH = path.resolve('public', 'talent-icons');
const SPELL_ICON_DBC_URL =
  'https://raw.githubusercontent.com/DreamCoreRev/EonsDBC/c98c8e4972086195d1306b7830d3e8452026b68d/DBFilesClient/dbc/SpellIcon.dbc';
const ICON_CDN_URL = 'https://wow.zamimg.com/images/wow/icons/large';

const CLASS_TREES = [
  ['warrior', '#c79c6e', [[161, 'arms'], [164, 'fury'], [163, 'protection']]],
  ['paladin', '#f58cba', [[382, 'holy'], [383, 'protection'], [381, 'retribution']]],
  ['hunter', '#abd473', [[361, 'beast mastery'], [363, 'marksmanship'], [362, 'survival']]],
  ['rogue', '#fff569', [[182, 'assassination'], [181, 'combat'], [183, 'subtlety']]],
  ['priest', '#ffffff', [[201, 'discipline'], [202, 'holy'], [203, 'shadow']]],
  ['shaman', '#0070de', [[261, 'elemental'], [263, 'enhancement'], [262, 'restoration']]],
  ['mage', '#69ccf0', [[81, 'arcane'], [41, 'fire'], [61, 'frost']]],
  ['warlock', '#9482c9', [[302, 'affliction'], [303, 'demonology'], [301, 'destruction']]],
  ['druid', '#ff7d0a', [[283, 'balance'], [281, 'feral combat'], [282, 'restoration']]],
];

function parseDbc(buffer, expectedFields, label) {
  if (buffer.toString('ascii', 0, 4) !== 'WDBC') throw new Error(`${label} is not a WDBC file`);
  const recordCount = buffer.readUInt32LE(4);
  const fieldCount = buffer.readUInt32LE(8);
  const recordSize = buffer.readUInt32LE(12);
  const stringSize = buffer.readUInt32LE(16);
  if (fieldCount !== expectedFields || recordSize !== expectedFields * 4) {
    throw new Error(`${label} layout changed: ${fieldCount} fields, ${recordSize} byte records`);
  }
  return {
    buffer,
    recordCount,
    fieldCount,
    recordSize,
    stringsOffset: 20 + recordCount * recordSize,
    stringSize,
  };
}

function uint(dbc, record, field) {
  return dbc.buffer.readUInt32LE(20 + record * dbc.recordSize + field * 4);
}

function int(dbc, record, field) {
  return dbc.buffer.readInt32LE(20 + record * dbc.recordSize + field * 4);
}

function string(dbc, record, field) {
  const offset = uint(dbc, record, field);
  if (!offset) return '';
  const start = dbc.stringsOffset + offset;
  const end = dbc.buffer.indexOf(0, start);
  return dbc.buffer.toString('utf8', start, end === -1 ? undefined : end);
}

function cleanText(value) {
  return value
    .replace(/\|c[0-9a-f]{8}/gi, '')
    .replace(/\|r/gi, '')
    .replace(/\|T[^|]+\|t/gi, '')
    .replace(/\|H[^|]+\|h([^|]*)\|h/gi, '$1')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCommit(repository) {
  try {
    return execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function loadSpellIconDbc() {
  if (process.env.SPELL_ICON_DBC_PATH) return readFile(process.env.SPELL_ICON_DBC_PATH);
  const response = await fetch(SPELL_ICON_DBC_URL);
  if (!response.ok) throw new Error(`Could not download SpellIcon.dbc (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

const [talentBuffer, spellBuffer, spellIconBuffer] = await Promise.all([
  readFile(TALENT_PATH),
  readFile(SPELL_PATH),
  loadSpellIconDbc(),
]);
const talentDbc = parseDbc(talentBuffer, 23, 'Talent.dbc');
const spellDbc = parseDbc(spellBuffer, 234, 'Spell.dbc');
const spellIconDbc = parseDbc(spellIconBuffer, 2, 'SpellIcon.dbc');

const spellIcons = new Map();
for (let record = 0; record < spellIconDbc.recordCount; record += 1) {
  const iconPath = string(spellIconDbc, record, 1);
  const iconName = iconPath.split(/[\\/]/).pop()?.toLowerCase();
  if (iconName) spellIcons.set(uint(spellIconDbc, record, 0), iconName);
}

const spells = new Map();
for (let record = 0; record < spellDbc.recordCount; record += 1) {
  const id = uint(spellDbc, record, 0);
  spells.set(id, {
    id,
    iconId: uint(spellDbc, record, 133),
    name: cleanText(string(spellDbc, record, 136)),
    rank: cleanText(string(spellDbc, record, 153)),
    description: cleanText(string(spellDbc, record, 170)),
    effects: [int(spellDbc, record, 80), int(spellDbc, record, 81), int(spellDbc, record, 82)].map(
      (value) => value + 1,
    ),
    procChance: uint(spellDbc, record, 35),
    procCharges: uint(spellDbc, record, 36),
    stackAmount: uint(spellDbc, record, 49),
  });
}

function formatDescription(description, currentSpell) {
  return description
    .replace(/\$\/(\d+);S([1-3])/gi, (_, divisor, effect) => {
      const value = currentSpell.effects[Number(effect) - 1];
      return String(Math.abs(value / Number(divisor)));
    })
    .replace(/\$(\d*)s([1-3])/gi, (_, spellId, effect) => {
      const source = spellId ? spells.get(Number(spellId)) : currentSpell;
      return source ? String(Math.abs(source.effects[Number(effect) - 1])) : '';
    })
    .replace(/\$(\d*)d/gi, 'the effect duration')
    .replace(/\$\/?[^\s,.;%]+/g, 'an amount')
    .replace(/\s+/g, ' ')
    .trim();
}

const talentRows = [];
for (let record = 0; record < talentDbc.recordCount; record += 1) {
  const rankSpellIds = Array.from({ length: 5 }, (_, index) => uint(talentDbc, record, 4 + index)).filter(Boolean);
  talentRows.push({
    id: uint(talentDbc, record, 0),
    treeId: uint(talentDbc, record, 1),
    row: uint(talentDbc, record, 2),
    column: uint(talentDbc, record, 3),
    rankSpellIds,
    prerequisiteId: uint(talentDbc, record, 13) || null,
    prerequisiteRank: uint(talentDbc, record, 13) ? uint(talentDbc, record, 16) + 1 : 0,
  });
}

const classes = CLASS_TREES.map(([id, color, treeDefinitions]) => ({
  id,
  name: id,
  color,
  trees: treeDefinitions.map(([treeId, name]) => {
    const talents = talentRows
      .filter((talent) => talent.treeId === treeId)
      .map((talent) => {
        const ranks = talent.rankSpellIds.map((spellId) => {
          const spell = spells.get(spellId);
          if (!spell) throw new Error(`Missing spell ${spellId} for talent ${talent.id}`);
          return {
            spellId,
            name: spell.name,
            rank: spell.rank,
            description: formatDescription(spell.description, spell),
          };
        });
        const firstSpell = spells.get(talent.rankSpellIds[0]);
        const iconName = spellIcons.get(firstSpell.iconId);
        if (!iconName) throw new Error(`Missing icon ${firstSpell.iconId} for talent ${talent.id}`);
        return {
          ...talent,
          iconId: firstSpell.iconId,
          iconUrl: `/talent-icons/${firstSpell.iconId}-${iconName}.jpg`,
          name: firstSpell.name,
          ranks,
        };
      })
      .sort((a, b) => a.row - b.row || a.column - b.column);
    if (!talents.length) throw new Error(`No talents found for ${name} (${treeId})`);
    return { id: treeId, name, talents };
  }),
}));

const payload = {
  source: {
    repository: 'gallardoS/swarena-game',
    commit: getCommit(GAME_REPOSITORY),
    talentDbcSha256: sha256(talentBuffer),
    spellDbcSha256: sha256(spellBuffer),
    spellIconDbcSha256: sha256(spellIconBuffer),
  },
  maxPoints: 61,
  classes,
};

const usedIcons = new Map();
for (const gameClass of classes) {
  for (const tree of gameClass.trees) {
    for (const talent of tree.talents) {
      usedIcons.set(talent.iconId, talent.iconUrl);
    }
  }
}

await mkdir(ICON_OUTPUT_PATH, { recursive: true });
const iconEntries = [...usedIcons.entries()];
for (let offset = 0; offset < iconEntries.length; offset += 16) {
  await Promise.all(
    iconEntries.slice(offset, offset + 16).map(async ([iconId, iconUrl]) => {
      const iconName = spellIcons.get(iconId);
      const response = await fetch(`${ICON_CDN_URL}/${iconName}.jpg`);
      if (!response.ok) throw new Error(`Could not download icon ${iconId} (${response.status})`);
      await writeFile(path.join(ICON_OUTPUT_PATH, path.basename(iconUrl)), Buffer.from(await response.arrayBuffer()));
    }),
  );
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(
  `Generated ${OUTPUT_PATH} with ${classes.reduce((sum, gameClass) => sum + gameClass.trees.reduce((treeSum, tree) => treeSum + tree.talents.length, 0), 0)} talents and ${usedIcons.size} in-game icons.`,
);
