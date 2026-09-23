// ============================================================
// MetricsChart.tsx — Gráfica de Rendimiento en Tiempo Real
// ============================================================
// Gráfica vectorial SVG ligera, reactiva y fluida.
// Diseñada para mostrar la evolución temporal de CPU o Memoria RAM:
//   - Fondo con degradado moderno
//   - Línea de trazado suave
//   - Línea de referencia opcional (ej. límite de RAM asignada)
//   - Tooltip interactivo al pasar el cursor
// ============================================================

import React, { useState } from 'react';
import { MetricPoint } from '../types';

interface MetricsChartProps {
  title: string;
  data: MetricPoint[];
  dataKey: 'cpu' | 'memoryMB';
  unit: string;
  maxValue?: number;       // Si no se indica, se calcula del máximo encontrado o 100 para CPU
  color?: 'emerald' | 'cyan' | 'violet' | 'amber' | 'rose';
  height?: number;
  thresholdValue?: number; // Línea discontinua de advertencia/límite
  thresholdLabel?: string;
}

export default function MetricsChart({
  title,
  data,
  dataKey,
  unit,
  maxValue,
  color = 'emerald',
  height = 180,
  thresholdValue,
  thresholdLabel,
}: MetricsChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Paleta de colores según prop
  const colorMap = {
    emerald: {
      stroke: '#10b981',
      fillStart: 'rgba(16, 185, 129, 0.35)',
      fillEnd: 'rgba(16, 185, 129, 0.02)',
      dot: '#34d399',
    },
    cyan: {
      stroke: '#06b6d4',
      fillStart: 'rgba(6, 182, 212, 0.35)',
      fillEnd: 'rgba(6, 182, 212, 0.02)',
      dot: '#22d3ee',
    },
    violet: {
      stroke: '#8b5cf6',
      fillStart: 'rgba(139, 92, 246, 0.35)',
      fillEnd: 'rgba(139, 92, 246, 0.02)',
      dot: '#a78bfa',
    },
    amber: {
      stroke: '#f59e0b',
      fillStart: 'rgba(245, 158, 11, 0.35)',
      fillEnd: 'rgba(245, 158, 11, 0.02)',
      dot: '#fbbf24',
    },
    rose: {
      stroke: '#f43f5e',
      fillStart: 'rgba(244, 63, 94, 0.35)',
      fillEnd: 'rgba(244, 63, 94, 0.02)',
      dot: '#fb7185',
    },
  }[color];

  const chartWidth = 500;
  const paddingX = 40;
  const paddingY = 25;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = height - paddingY * 2;

  // Determinar el rango máximo vertical (Y)
  const currentValues = data.map((d) => d[dataKey]);
  const maxDataVal = currentValues.length > 0 ? Math.max(...currentValues) : 0;
  
  let computedMax = maxValue;
  if (!computedMax) {
    if (dataKey === 'cpu') {
      computedMax = 100;
    } else {
      computedMax = Math.max(maxDataVal * 1.25, thresholdValue ? thresholdValue * 1.1 : 1024);
    }
  }

  // Si no hay datos suficientes todavía
  const points = data.length > 0 ? data : [{ timestamp: '--', cpu: 0, memoryMB: 0, playersOnline: 0 }];

  // Generar coordenadas X, Y para cada punto
  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? paddingX + plotWidth / 2
        : paddingX + (i / (points.length - 1)) * plotWidth;
    const val = p[dataKey];
    const clampedVal = Math.min(val, computedMax!);
    const y = paddingY + plotHeight - (clampedVal / computedMax!) * plotHeight;
    return { x, y, val, time: p.timestamp };
  });

  // Generar trazado SVG (Path)
  let linePath = '';
  if (coords.length === 1) {
    linePath = `M ${coords[0].x} ${coords[0].y}`;
  } else {
    linePath = coords.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x},${curr.y}` : `${acc} L ${curr.x},${curr.y}`;
    }, '');
  }

  // Trazado de relleno cerrado
  const firstX = coords[0].x;
  const lastX = coords[coords.length - 1].x;
  const baselineY = paddingY + plotHeight;
  const areaPath = `${linePath} L ${lastX},${baselineY} L ${firstX},${baselineY} Z`;

  // Coordenada Y para la línea de umbral opcional
  const thresholdY =
    thresholdValue !== undefined
      ? paddingY + plotHeight - (Math.min(thresholdValue, computedMax!) / computedMax!) * plotHeight
      : null;

  // Valor actual más reciente
  const latestValue = coords[coords.length - 1]?.val ?? 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between">
      {/* Cabecera de la gráfica */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white font-mono">
            {hoverIndex !== null ? coords[hoverIndex]?.val : latestValue}
            <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>
          </span>
          {hoverIndex !== null && (
            <span className="text-xs text-gray-400 bg-[#21262d] px-2 py-0.5 rounded">
              {coords[hoverIndex]?.time}
            </span>
          )}
        </div>
      </div>

      {/* Contenedor SVG Responsivo */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorMap.fillStart} />
              <stop offset="100%" stopColor={colorMap.fillEnd} />
            </linearGradient>
          </defs>

          {/* Líneas horizontales de guía (Grid) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = paddingY + plotHeight - pct * plotHeight;
            const gridVal = Math.round(pct * computedMax!);
            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="#30363d"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingX - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#8b949e"
                  className="font-mono"
                >
                  {gridVal}
                </text>
              </g>
            );
          })}

          {/* Línea de umbral/límite si existe */}
          {thresholdY !== null && (
            <g>
              <line
                x1={paddingX}
                y1={thresholdY}
                x2={chartWidth - paddingX}
                y2={thresholdY}
                stroke="#f43f5e"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              {thresholdLabel && (
                <text
                  x={chartWidth - paddingX}
                  y={thresholdY - 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="#f43f5e"
                  fontWeight="bold"
                >
                  {thresholdLabel} ({thresholdValue} {unit})
                </text>
              )}
            </g>
          )}

          {/* Área sombreada */}
          {coords.length > 1 && (
            <path d={areaPath} fill={`url(#grad-${title.replace(/\s+/g, '')})`} />
          )}

          {/* Línea del gráfico */}
          <path
            d={linePath}
            fill="none"
            stroke={colorMap.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Puntos y zonas de detección de hover */}
          {coords.map((c, i) => (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(i)}
            >
              {/* Círculo invisible más grande para facilitar el hover */}
              <circle cx={c.x} cy={c.y} r="10" fill="transparent" />
              
              {/* Punto visible en hover o último punto */}
              {(hoverIndex === i || (hoverIndex === null && i === coords.length - 1)) && (
                <>
                  <line
                    x1={c.x}
                    y1={paddingY}
                    x2={c.x}
                    y2={baselineY}
                    stroke={colorMap.stroke}
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.6"
                  />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="4.5"
                    fill={colorMap.dot}
                    stroke="#0d1117"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Eje inferior con tiempo */}
      <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono mt-1 px-4">
        <span>{coords[0]?.time || 'hace 1m'}</span>
        <span>{coords[Math.floor(coords.length / 2)]?.time || ''}</span>
        <span className="text-gray-400 font-semibold">{coords[coords.length - 1]?.time || 'ahora'}</span>
      </div>
    </div>
  );
}
