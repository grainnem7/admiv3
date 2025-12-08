const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/ui/components/InputProfileSelector.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the nested button structure with sibling buttons
const oldPattern = `          return (
            <div key={profile.id}>
              <button
                onClick={() => handleSelect(profile.id)}
                style={{
                  width: '100%',
                  padding: 'var(--space-sm) var(--space-md)',
                  border: \`2px solid \${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}\`,
                  borderRadius: 'var(--border-radius)',
                  backgroundColor: isSelected ? 'var(--color-primary-muted)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                      }}
                    >
                      {/* Modality icons */}
                      {profile.activeModalities.pose && (
                        <span title="Pose tracking">{getModalityIcon('pose')}</span>
                      )}
                      {(profile.activeModalities.leftHand || profile.activeModalities.rightHand) && (
                        <span title="Hand tracking">{getModalityIcon('hands')}</span>
                      )}
                      {profile.activeModalities.face && (
                        <span title="Face tracking">{getModalityIcon('face')}</span>
                      )}
                      <span style={{ marginLeft: 'var(--space-xs)' }}>{profile.name}</span>
                    </div>

                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {profile.description || getProfileDescription(profile)}
                    </div>
                  </div>

                  {/* Expand button for details */}
                  {showDetails && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(profile.id);
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  )}
                </div>
              </button>

              {/* Expanded details */}`;

const newPattern = `          return (
            <div key={profile.id}>
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  border: \`2px solid \${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}\`,
                  borderRadius: 'var(--border-radius)',
                  backgroundColor: isSelected ? 'var(--color-primary-muted)' : 'transparent',
                  transition: 'all 0.15s ease',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => handleSelect(profile.id)}
                  style={{
                    flex: 1,
                    padding: 'var(--space-sm) var(--space-md)',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                      }}
                    >
                      {/* Modality icons */}
                      {profile.activeModalities.pose && (
                        <span title="Pose tracking">{getModalityIcon('pose')}</span>
                      )}
                      {(profile.activeModalities.leftHand || profile.activeModalities.rightHand) && (
                        <span title="Hand tracking">{getModalityIcon('hands')}</span>
                      )}
                      {profile.activeModalities.face && (
                        <span title="Face tracking">{getModalityIcon('face')}</span>
                      )}
                      <span style={{ marginLeft: 'var(--space-xs)' }}>{profile.name}</span>
                    </div>

                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {profile.description || getProfileDescription(profile)}
                    </div>
                  </div>
                </button>

                {/* Expand button for details - now sibling, not nested */}
                {showDetails && (
                  <button
                    onClick={() => toggleExpand(profile.id)}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderLeft: \`1px solid \${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}\`,
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                      fontSize: 'var(--font-size-sm)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                )}
              </div>

              {/* Expanded details */}`;

content = content.replace(oldPattern, newPattern);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed nested button issue!');
