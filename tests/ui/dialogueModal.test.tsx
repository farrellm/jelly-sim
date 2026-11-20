import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState, dispatch } from '../../src/sim/engine';
import { getActiveMainQuestView, getActiveRadiantTaskView } from '../../src/sim/quests';
import { DialogueModal } from '../../src/ui/DialogueModal';

describe('PR-10 Dr. Bubblegum DialogueModal UI', () => {
  it('renders Dr. Bubblegum portrait, crunchy-stern -> heart-of-gold dialogue, and starter-plot claim button', () => {
    const fresh = createInitialState({ nowMs: 1_000 });
    const onboarded = dispatch(
      fresh,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Mochi', parentTitle: 'Papa' },
      2_000,
    ).state;

    const html = renderToStaticMarkup(
      createElement(DialogueModal, {
        state: onboarded,
        mainQuest: getActiveMainQuestView(onboarded),
        radiantTask: getActiveRadiantTaskView(onboarded),
        onClaimQuest: () => {},
        onClose: () => {},
      }),
    );

    expect(html).toContain('assets/icons/dr_bubblegum.png');
    expect(html).toContain('Dr. Bubblegum');
    expect(html).toContain('STARTER PLOT GIFT');
    expect(html).toContain('Crunchy Exterior');
    expect(html).toContain('Heart of Gold');
    expect(html).toContain('Mochi');
    expect(html).toContain('Papa');
    expect(html).toContain('+35 JC');
    expect(html).toContain('+2 BB');
    expect(html).toContain('Accept Starter Plot &amp; Claim Gift');
  });

  it('shows just-claimed reward summary, next quest progress, and Extra Credit Task button', () => {
    let state = createInitialState({ nowMs: 1_000 });
    state = dispatch(
      state,
      { type: 'COMPLETE_ONBOARDING', beanName: 'Pip', parentTitle: 'Mama' },
      2_000,
    ).state;
    state = dispatch(state, { type: 'CLAIM_QUEST_REWARD', questId: 'q1_welcome' }, 3_000).state;

    const html = renderToStaticMarkup(
      createElement(DialogueModal, {
        state,
        mainQuest: getActiveMainQuestView(state),
        radiantTask: getActiveRadiantTaskView(state),
        justClaimed: {
          title: 'Welcome to Your Plot',
          coinsGained: 35,
          bucksGained: 2,
          xpGained: 15,
        },
        onClaimQuest: () => {},
        onRequestRadiantTask: () => {},
        onClose: () => {},
      }),
    );

    expect(html).toContain('Completed');
    expect(html).toContain('Welcome to Your Plot');
    expect(html).toContain('Survive First!');
    expect(html).toContain('0/2');
    expect(html).toContain('On it, Professor!');
    expect(html).toContain('Ask for Extra Credit Task');
  });
});
