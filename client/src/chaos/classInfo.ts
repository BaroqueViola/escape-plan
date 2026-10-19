// What the class picker and the in-game keybind card say about each Chaos class.

import type { ClassId, Role } from '../../../server/events';
import type { SpriteName } from './pixelSprites';

export interface KeyHelp { keys: string[]; text: string }
export interface ClassInfo {
  name: string;
  side: Role;
  ability: string; // short name on the card
  blurb: string; // one line on the card
  sprite: SpriteName;
  steps: { title: string; text: string; keys: string[] }[]; // how the ability works, in order
  controls: KeyHelp[]; // the controls bar
}

const MOVE: KeyHelp = { keys: ['W', 'A', 'S', 'D'], text: 'move 1 tile' };
const STAY: KeyHelp = { keys: ['X'], text: 'stay' };

export const CLASS_INFO: Record<ClassId, ClassInfo> = {
  allmight: {
    name: 'All Might', side: 'prisoner', ability: 'SMASH PUNCH', sprite: 'allmight',
    blurb: 'Charges for 2 turns, then punches in a straight line and stuns the warden.',
    steps: [
      { title: 'Charge up', text: 'The bar fills by 1 every turn. It is full after 2 turns.', keys: [] },
      { title: 'Transform', text: 'Press Q when the bar is full. He turns buff, ready to punch.', keys: ['Q'] },
      { title: 'Punch', text: 'Press a direction. The punch stuns the warden for 2 turns and the shockwave cracks the ground to the edge. Uses your turn.', keys: ['W', 'A', 'S', 'D'] },
      { title: 'Back to weak', text: 'Hit or miss, he drops back to weak form and the bar starts again.', keys: [] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'transform (bar full)' }, { keys: ['W', 'A', 'S', 'D'], text: 'aim + throw the punch' }, { keys: ['Esc'], text: 'back out, keep the charge' }],
  },
  naruto: {
    name: 'Naruto', side: 'prisoner', ability: 'SHADOW CLONE JUTSU', sprite: 'naruto',
    blurb: 'Places walking clones and secretly swaps places with them.',
    steps: [
      { title: 'Open the jutsu', text: 'Tiles within 2 light up. You bank +1 clone every turn you don\'t use it, up to 3.', keys: ['Q'] },
      { title: 'Place and point', text: 'Click a lit tile to drop a clone, then press an arrow for the way it walks. Repeat for each clone.', keys: ['Click', '↑', '↓', '←', '→'] },
      { title: 'Finish', text: 'Enter ends your turn. Clones walk 1 tile a turn and stop at walls. A caught clone vanishes.', keys: ['Enter'] },
      { title: 'Secret swap', text: 'On a later turn, press E and click a clone to trade places. The warden sees nothing change.', keys: ['E', 'Click'] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'shadow clone' }, { keys: ['E'], text: 'secret swap' }, { keys: ['Esc'], text: 'cancel' }],
  },
  sukuna: {
    name: 'Sukuna', side: 'prisoner', ability: 'DISMANTLE · SHRINE', sprite: 'sukuna',
    blurb: 'Breaks rocks, collects 3 fingers and pushes the warden away.',
    steps: [
      { title: 'Dismantle', text: 'Press Q: rocks next to you light up. Click one to break it and step onto it. Cooldown 1.', keys: ['Q', 'Click'] },
      { title: 'Collect fingers', text: '3 fingers are on the map. Walk onto one to pick it up. The warden can crush one; it comes back somewhere else.', keys: ['W', 'A', 'S', 'D'] },
      { title: 'Malevolent Shrine', text: 'With 3 fingers, press E. The warden is pushed 3 tiles away.', keys: ['E'] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'dismantle' }, { keys: ['E'], text: 'malevolent shrine (3 fingers)' }],
  },
  afo: {
    name: 'All For One', side: 'warden', ability: 'STEAL', sprite: 'afo',
    blurb: 'Steals the prisoner\'s power and uses it once with no charge-up.',
    steps: [
      { title: 'Steal', text: 'Press Q to take the prisoner\'s ability. They lose it for 1 turn. Cooldown 2.', keys: ['Q'] },
      { title: 'Use it', text: 'Press E to fire it once with no charge-up, using that class\'s controls.', keys: ['E'] },
      { title: 'Second move', text: 'From Sukuna you also get the Shrine on R.', keys: ['R'] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'steal' }, { keys: ['E'], text: 'use the stolen ability' }, { keys: ['R'], text: '2nd stolen move (vs Sukuna)' }],
  },
  sasuke: {
    name: 'Sasuke', side: 'warden', ability: 'SHARINGAN', sprite: 'sasuke',
    blurb: 'Traps the prisoner in darkness with shuffled controls.',
    steps: [
      { title: 'Line of sight', text: 'Works when the prisoner is in your row or column with nothing in between.', keys: [] },
      { title: 'Sharingan', text: 'Press Q. For 2 turns the prisoner sees nothing and their movement keys are secretly shuffled.', keys: ['Q'] },
      { title: 'Cooldown', text: 'Ready again 4 turns after the illusion ends.', keys: [] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'sharingan (prisoner in your row or column)' }],
  },
  gojo: {
    name: 'Gojo', side: 'warden', ability: 'INFINITE VOID', sprite: 'gojo',
    blurb: 'Pulls the prisoner into the Void timing challenge.',
    steps: [
      { title: 'In range', text: 'Works when the prisoner is within 2 tiles.', keys: [] },
      { title: 'Infinite Void', text: 'Press Q. The prisoner has to stop a line in a glowing zone, 3 rounds. Cooldown 3.', keys: ['Q'] },
      { title: 'Result', text: 'If they hit all 3 they go back to the board. Miss once and they are caught.', keys: ['SPACE'] },
    ],
    controls: [MOVE, STAY, { keys: ['Q'], text: 'infinite void (prisoner within 2)' }],
  },
};

export const SIDE_CLASSES: Record<Role, ClassId[]> = {
  prisoner: ['allmight', 'naruto', 'sukuna'],
  warden: ['afo', 'sasuke', 'gojo'],
};
