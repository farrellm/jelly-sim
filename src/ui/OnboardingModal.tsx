import { useState, type FormEvent } from 'react';
import { INITIAL_STARTER_CONFIG, PARENT_TITLE_PRESETS } from '../sim/constants';
import { resolveAssetUrl } from '../utils/assets';

export interface OnboardingModalProps {
  defaultBeanName?: string;
  defaultParentTitle?: string;
  onComplete: (beanName: string, parentTitle: string) => void;
}

export function OnboardingModal({
  defaultBeanName = INITIAL_STARTER_CONFIG.defaultBeanName,
  defaultParentTitle = INITIAL_STARTER_CONFIG.defaultParentTitle,
  onComplete,
}: OnboardingModalProps) {
  const [beanName, setBeanName] = useState(defaultBeanName);
  const [selectedPreset, setSelectedPreset] = useState<string>(defaultParentTitle);
  const [useCustomTitle, setUseCustomTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState('');

  const effectiveParentTitle =
    (useCustomTitle ? customTitle.trim() : selectedPreset) ||
    INITIAL_STARTER_CONFIG.defaultParentTitle;
  const effectiveBeanName = beanName.trim() || INITIAL_STARTER_CONFIG.defaultBeanName;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onComplete(effectiveBeanName, effectiveParentTitle);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <form className="onboarding-card" onSubmit={handleSubmit}>
        <div className="onboarding-avatar-wrap">
          <img
            src={resolveAssetUrl('assets/icons/larva.png')}
            alt="Larva Jelly Bean"
            className="onboarding-avatar"
            width={76}
            height={76}
          />
        </div>

        <p className="stage-eyebrow">Dr. Bubblegum&apos;s Starter Plot</p>
        <h1 id="onboard-title" className="onboarding-heading">
          Welcome to Jelly Bean Island!
        </h1>
        <p className="onboarding-subtitle">
          Your tiny Larva Jelly Bean just hatched. Give it a name and choose what it should call you!
        </p>

        <div className="onboarding-field">
          <label htmlFor="bean-name-input" className="onboarding-label">
            Jelly Bean&apos;s Name
          </label>
          <input
            id="bean-name-input"
            type="text"
            className="onboarding-input"
            value={beanName}
            maxLength={INITIAL_STARTER_CONFIG.maxNameLength}
            placeholder={INITIAL_STARTER_CONFIG.defaultBeanName}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setBeanName(e.target.value)}
          />
        </div>

        <div className="onboarding-field">
          <span className="onboarding-label" id="parent-title-label">
            What should it call you?
          </span>
          <div className="title-presets" role="group" aria-labelledby="parent-title-label">
            {PARENT_TITLE_PRESETS.map((preset) => {
              const active = !useCustomTitle && selectedPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`preset-pill${active ? ' preset-pill--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setUseCustomTitle(false);
                    setSelectedPreset(preset);
                  }}
                >
                  {preset}
                </button>
              );
            })}
            <button
              type="button"
              className={`preset-pill${useCustomTitle ? ' preset-pill--active' : ''}`}
              aria-pressed={useCustomTitle}
              onClick={() => setUseCustomTitle(true)}
            >
              Custom
            </button>
          </div>

          {useCustomTitle && (
            <input
              type="text"
              className="onboarding-input onboarding-input--compact"
              value={customTitle}
              maxLength={INITIAL_STARTER_CONFIG.maxParentTitleLength}
              placeholder="e.g. Chief, Chef, Boss"
              aria-label="Custom parent title"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          )}
        </div>

        <div className="onboarding-preview" aria-live="polite">
          <span className="onboarding-preview-bubble">
            &ldquo;{effectiveParentTitle}! Feed {effectiveBeanName}!&rdquo;
          </span>
        </div>

        <button type="submit" className="primary-cta-button">
          Meet {effectiveBeanName}
        </button>
      </form>
    </div>
  );
}
