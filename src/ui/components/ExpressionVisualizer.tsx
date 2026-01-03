/**
 * ExpressionVisualizer - Real-time display of expression control values
 *
 * Shows face, hand, and body expression mappings as they're detected
 */

import React from 'react';

interface ExpressionValue {
  name: string;
  value: number;
  target: string;
}

interface ExpressionVisualizerProps {
  faceExpressions?: ExpressionValue[];
  handExpressions?: ExpressionValue[];
  bodyExpressions?: ExpressionValue[];
  compact?: boolean;
}

const ExpressionBar: React.FC<{ expression: ExpressionValue }> = ({ expression }) => {
  const percentage = Math.min(100, Math.max(0, expression.value * 100));

  return (
    <div className="expression-bar">
      <div className="expression-bar-header">
        <span className="expression-name">{expression.name}</span>
        <span className="expression-target">{expression.target}</span>
      </div>
      <div className="expression-bar-track">
        <div
          className="expression-bar-fill"
          style={{ width: `${percentage}%` }}
        />
        <span className="expression-value">{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
};

export const ExpressionVisualizer: React.FC<ExpressionVisualizerProps> = ({
  faceExpressions = [],
  handExpressions = [],
  bodyExpressions = [],
  compact = false,
}) => {
  const hasExpressions = faceExpressions.length > 0 || handExpressions.length > 0 || bodyExpressions.length > 0;

  if (!hasExpressions) {
    return (
      <div className="expression-visualizer empty">
        <p>No expression data available</p>
        <p className="hint">Enable tracking to see expression values</p>
      </div>
    );
  }

  return (
    <div className={`expression-visualizer ${compact ? 'compact' : ''}`}>
      {faceExpressions.length > 0 && (
        <div className="expression-group">
          <h4 className="expression-group-title">Face</h4>
          {faceExpressions.map((expr, i) => (
            <ExpressionBar key={`face-${i}`} expression={expr} />
          ))}
        </div>
      )}

      {handExpressions.length > 0 && (
        <div className="expression-group">
          <h4 className="expression-group-title">Hand</h4>
          {handExpressions.map((expr, i) => (
            <ExpressionBar key={`hand-${i}`} expression={expr} />
          ))}
        </div>
      )}

      {bodyExpressions.length > 0 && (
        <div className="expression-group">
          <h4 className="expression-group-title">Body</h4>
          {bodyExpressions.map((expr, i) => (
            <ExpressionBar key={`body-${i}`} expression={expr} />
          ))}
        </div>
      )}

      <style>{`
        .expression-visualizer {
          padding: 12px;
          background: #1a1a2e;
          border-radius: 8px;
        }

        .expression-visualizer.empty {
          text-align: center;
          color: #666;
        }

        .expression-visualizer.empty .hint {
          font-size: 12px;
          margin-top: 4px;
        }

        .expression-visualizer.compact {
          padding: 8px;
        }

        .expression-visualizer.compact .expression-group-title {
          font-size: 11px;
          margin-bottom: 4px;
        }

        .expression-visualizer.compact .expression-bar {
          margin-bottom: 4px;
        }

        .expression-group {
          margin-bottom: 12px;
        }

        .expression-group:last-child {
          margin-bottom: 0;
        }

        .expression-group-title {
          font-size: 12px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          margin: 0 0 8px 0;
        }

        .expression-bar {
          margin-bottom: 8px;
        }

        .expression-bar-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 2px;
        }

        .expression-name {
          color: #eee;
        }

        .expression-target {
          color: #6a6aff;
        }

        .expression-bar-track {
          position: relative;
          height: 16px;
          background: #0d0d1a;
          border-radius: 4px;
          overflow: hidden;
        }

        .expression-bar-fill {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: linear-gradient(90deg, #4a4aff, #6a6aff);
          transition: width 0.1s ease-out;
          border-radius: 4px;
        }

        .expression-value {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 10px;
          color: #fff;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default ExpressionVisualizer;
