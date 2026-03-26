import { computed } from '@preact/signals';
import { ApiServiceContext, machine } from '../../services/ApiService.js';
import { useCallback, useContext, useEffect, useRef } from 'preact/hooks';

const status = computed(() => machine.value.status);
const isConnected = computed(() => machine.value.connected);
const history = computed(() => machine.value.history);

const MODES = [
  { id: 0, label: 'Standby' },
  { id: 1, label: 'Brew' },
  { id: 2, label: 'Steam' },
  { id: 3, label: 'Water' },
  { id: 4, label: 'Grind' },
];

const zeroPad = (n, p) => String(n).padStart(p, '0');
function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${zeroPad(Math.floor(s / 60), 1)}:${zeroPad(s % 60, 2)}`;
}

// SVG arc helper (SVG angle: 0°=right, clockwise positive)
function describeArc(cx, cy, r, startDeg, endDeg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  let span = endDeg - startDeg;
  if (span <= 0) span += 360;
  const large = span > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// Gauge arc: starts at 135° (lower-left), sweeps 270° clockwise to 45° (lower-right)
// going through 270° (top) of the SVG circle
const GAUGE_START = 135;
const GAUGE_SPAN = 270;

function valueAngle(value, max) {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  return GAUGE_START + ratio * GAUGE_SPAN;
}

function ArcGauge({ current, target, max, label, unit, color, size = 200 }) {
  const cx = size / 2;
  const cy = size / 2 + 12;
  const r = size * 0.4;
  const sw = size * 0.07;

  const ratio = Math.min(Math.max(current / max, 0), 1);
  const vAngle = valueAngle(current, max);
  const tAngle = valueAngle(target, max);

  // Target tick: small line at target position on outer edge of track
  const toRad = (d) => (d * Math.PI) / 180;
  const tickR = r + sw * 0.5 + 2;
  const tickInR = r - sw * 0.5 - 2;
  const tx1 = cx + tickR * Math.cos(toRad(tAngle));
  const ty1 = cy + tickR * Math.sin(toRad(tAngle));
  const tx2 = cx + tickInR * Math.cos(toRad(tAngle));
  const ty2 = cy + tickInR * Math.sin(toRad(tAngle));

  return (
    <div className='flex flex-col items-center'>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style='overflow: visible;'
      >
        {/* Background track */}
        <path
          d={describeArc(cx, cy, r, GAUGE_START, 45)}
          fill='none'
          stroke='rgba(255,255,255,0.08)'
          strokeWidth={sw}
          strokeLinecap='round'
        />
        {/* Value track */}
        {ratio > 0.005 && (
          <path
            d={describeArc(cx, cy, r, GAUGE_START, vAngle)}
            fill='none'
            stroke={color}
            strokeWidth={sw}
            strokeLinecap='round'
          />
        )}
        {/* Target marker tick */}
        <line
          x1={tx1.toFixed(2)}
          y1={ty1.toFixed(2)}
          x2={tx2.toFixed(2)}
          y2={ty2.toFixed(2)}
          stroke='rgba(255,255,255,0.55)'
          strokeWidth='3'
          strokeLinecap='round'
        />
        {/* Current value */}
        <text
          x={cx}
          y={cy - size * 0.05}
          textAnchor='middle'
          fill='white'
          fontSize={size * 0.175}
          fontWeight='700'
          fontFamily='system-ui, sans-serif'
        >
          {current.toFixed(1)}
        </text>
        {/* Unit */}
        <text
          x={cx}
          y={cy + size * 0.08}
          textAnchor='middle'
          fill='rgba(255,255,255,0.55)'
          fontSize={size * 0.075}
          fontFamily='system-ui, sans-serif'
        >
          {unit}
        </text>
        {/* Target */}
        <text
          x={cx}
          y={cy + size * 0.16}
          textAnchor='middle'
          fill='rgba(255,255,255,0.32)'
          fontSize={size * 0.065}
          fontFamily='system-ui, sans-serif'
        >
          → {typeof target === 'number' ? target.toFixed(1) : target}
          {unit}
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + size * 0.26}
          textAnchor='middle'
          fill='rgba(255,255,255,0.28)'
          fontSize={size * 0.055}
          fontFamily='system-ui, sans-serif'
          letterSpacing='2'
        >
          {label.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

function SparklineChart({ dataKey, color, height = 48 }) {
  const data = history.value;
  if (!data || data.length < 2) return null;

  const vals = data.map((d) => d[dataKey]).filter((v) => v != null && !isNaN(v));
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 300;
  const h = height;

  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width='100%' height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio='none'>
      <polyline
        points={points.join(' ')}
        fill='none'
        stroke={color}
        strokeWidth='1.5'
        strokeLinejoin='round'
        strokeLinecap='round'
        opacity='0.7'
      />
    </svg>
  );
}

function ProgressBar({ value, max, color = '#3b82f6' }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div className='h-2 w-full overflow-hidden rounded-full bg-white/10'>
      <div
        className='h-full rounded-full transition-all duration-300'
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function ProcessSection({ processInfo, mode }) {
  if (!processInfo) {
    return (
      <div className='flex flex-col items-center gap-1 py-2 text-center'>
        <div className='text-xl font-semibold text-white/70'>
          {mode === 0 && 'Standby'}
          {mode === 1 && 'Ready to Brew'}
          {mode === 2 && 'Steam Mode'}
          {mode === 3 && 'Water Mode'}
          {mode === 4 && 'Grind Mode'}
        </div>
        <div className='text-sm text-white/35'>
          {mode === 0 && 'Machine is idle'}
          {mode === 1 && 'Press Start to begin'}
          {mode === 2 && 'Heating up…'}
          {mode === 3 && 'Open steam valve to pull water'}
          {mode === 4 && 'Press Start to grind'}
        </div>
      </div>
    );
  }

  const active = !!processInfo.a;
  const elapsed = Math.floor(processInfo.e / 1000);
  const isVolumetric = processInfo.tt === 'volumetric';

  const targetDisplay = isVolumetric
    ? `${processInfo.pt?.toFixed(0)}g`
    : formatMs(processInfo.pt);
  const progressDisplay = isVolumetric
    ? `${processInfo.pp?.toFixed(1)}g`
    : formatMs(processInfo.pp);

  return (
    <div className='flex flex-col items-center gap-2 w-full'>
      <div className='text-xs font-light tracking-widest text-white/40 uppercase'>
        {processInfo.s === 'brew' ? 'Brewing' : processInfo.s === 'grind' ? 'Grinding' : 'Infusion'}
      </div>
      <div className='text-2xl font-bold text-white'>{processInfo.l}</div>
      <div className='w-full px-4'>
        <ProgressBar value={processInfo.pp} max={processInfo.pt} color='#6366f1' />
      </div>
      <div className='flex w-full justify-between px-4 text-sm text-white/50'>
        <span>{progressDisplay}</span>
        <span className='text-white font-semibold text-base'>{formatMs(processInfo.e)}</span>
        <span>{targetDisplay}</span>
      </div>
    </div>
  );
}

export function DisplayUI() {
  const apiService = useContext(ApiServiceContext);
  const s = status.value;
  const connected = isConnected.value;
  const processInfo = s.process;
  const active = !!processInfo?.a;
  const finished = !!processInfo?.e && !active;
  const mode = s.mode ?? 0;

  const tempColor = (() => {
    if (mode === 2) return '#f97316';
    const diff = Math.abs(s.currentTemperature - s.targetTemperature);
    if (diff < 3) return '#22c55e';
    if (diff < 8) return '#eab308';
    return '#ef4444';
  })();

  const changeMode = useCallback(
    (m) => {
      apiService?.send({ tp: 'req:change-mode', mode: m });
    },
    [apiService],
  );

  const activate = useCallback(() => {
    const tp = mode === 4 ? 'req:grind:activate' : 'req:process:activate';
    apiService?.send({ tp });
  }, [apiService, mode]);

  const deactivate = useCallback(() => {
    const tp = mode === 4 ? 'req:grind:deactivate' : 'req:process:deactivate';
    apiService?.send({ tp });
  }, [apiService, mode]);

  const clear = useCallback(() => {
    apiService?.send({ tp: 'req:process:clear' });
  }, [apiService]);

  const raiseTemp = useCallback(() => apiService?.send({ tp: 'req:raise-temp' }), [apiService]);
  const lowerTemp = useCallback(() => apiService?.send({ tp: 'req:lower-temp' }), [apiService]);
  const raiseTarget = useCallback(() => {
    const tp = mode === 4 ? 'req:raise-grind-target' : 'req:raise-brew-target';
    apiService?.send({ tp });
  }, [apiService, mode]);
  const lowerTarget = useCallback(() => {
    const tp = mode === 4 ? 'req:lower-grind-target' : 'req:lower-brew-target';
    apiService?.send({ tp });
  }, [apiService, mode]);

  const handleMainButton = useCallback(() => {
    if (active) deactivate();
    else if (finished) clear();
    else activate();
  }, [active, finished, activate, deactivate, clear]);

  const startFlush = useCallback(() => {
    apiService?.send({ tp: 'req:flush:start' });
  }, [apiService]);

  const showMainButton = mode === 1 || mode === 3 || mode === 4;

  const mainButtonLabel = active ? 'Stop' : finished ? 'Done' : 'Start';
  const mainButtonColor = active
    ? 'bg-red-600 hover:bg-red-500'
    : finished
      ? 'bg-emerald-600 hover:bg-emerald-500'
      : 'bg-indigo-600 hover:bg-indigo-500';

  const gaugeSize = 200;

  return (
    <div
      className='flex h-screen w-screen flex-col overflow-hidden'
      style='background: #0b1120; color: white; font-family: system-ui, sans-serif;'
    >
      {/* ── Header bar ── */}
      <div
        className='flex shrink-0 items-center justify-between px-4 py-2'
        style='background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.07);'
      >
        <div className='flex items-center gap-3'>
          <span className='text-sm font-bold tracking-widest text-white/80'>GAGGIMATE</span>
          <a
            href='/'
            className='rounded px-2 py-0.5 text-xs text-white/30 transition hover:text-white/60'
            style='border: 1px solid rgba(255,255,255,0.1);'
          >
            ← Dashboard
          </a>
        </div>
        <div className='flex items-center gap-4'>
          {s.selectedProfile && mode === 1 && (
            <a href='/profiles' className='text-xs text-white/40 hover:text-white/70 transition'>
              {s.selectedProfile}
            </a>
          )}
          <div className='flex items-center gap-1.5'>
            <div
              className='h-2 w-2 rounded-full'
              style={{
                background: connected ? '#22c55e' : '#ef4444',
                boxShadow: connected ? '0 0 6px #22c55e' : 'none',
              }}
            />
            <span className='text-xs text-white/40'>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <div
        className='flex shrink-0 items-center justify-center gap-1 px-4 py-2'
        style='border-bottom: 1px solid rgba(255,255,255,0.06);'
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => changeMode(m.id)}
            className='rounded-full px-3 py-1 text-sm font-medium transition-all duration-200'
            style={{
              background: mode === m.id ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color: mode === m.id ? 'white' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Main area ── */}
      <div className='flex flex-1 items-center justify-center overflow-hidden'>
        <div className='flex w-full max-w-5xl items-center justify-around gap-4 px-4'>
          {/* Temperature gauge */}
          <div className='shrink-0'>
            <ArcGauge
              current={s.currentTemperature ?? 0}
              target={s.targetTemperature ?? 0}
              max={140}
              label='Temperature'
              unit='°C'
              color={tempColor}
              size={gaugeSize}
            />
          </div>

          {/* Center controls */}
          <div className='flex min-w-0 flex-1 flex-col items-center gap-4'>
            {/* Process info */}
            <ProcessSection processInfo={processInfo ?? (finished ? s.process : null)} mode={mode} />

            {/* Steam / Water: temperature adjustment */}
            {(mode === 2 || mode === 3) && (
              <div className='flex flex-col items-center gap-2'>
                <div className='text-xs tracking-widest text-white/35 uppercase'>Temperature</div>
                <div className='flex items-center gap-4'>
                  <button
                    onClick={lowerTemp}
                    className='flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold transition'
                    style='background: rgba(255,255,255,0.08); border: none; color: white; cursor: pointer;'
                  >
                    −
                  </button>
                  <span className='min-w-[72px] text-center text-xl font-bold text-white'>
                    {s.targetTemperature}°C
                  </span>
                  <button
                    onClick={raiseTemp}
                    className='flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold transition'
                    style='background: rgba(255,255,255,0.08); border: none; color: white; cursor: pointer;'
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Grind target adjustment */}
            {mode === 4 && !active && !finished && (
              <div className='flex flex-col items-center gap-2'>
                <div className='text-xs tracking-widest text-white/35 uppercase'>Grind Target</div>
                <div className='flex items-center gap-4'>
                  <button
                    onClick={lowerTarget}
                    className='flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold'
                    style='background: rgba(255,255,255,0.08); border: none; color: white; cursor: pointer;'
                  >
                    −
                  </button>
                  <span className='min-w-[72px] text-center text-xl font-bold text-white'>
                    {s.grindTarget === 1 && s.volumetricAvailable
                      ? `${s.grindTargetVolume}g`
                      : `${Math.round((s.grindTargetDuration ?? 0) / 1000)}s`}
                  </span>
                  <button
                    onClick={raiseTarget}
                    className='flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold'
                    style='background: rgba(255,255,255,0.08); border: none; color: white; cursor: pointer;'
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* BT weight display */}
            {s.volumetricAvailable && s.bluetoothConnected && mode === 1 && (
              <div className='flex items-center gap-2 rounded-full px-3 py-1 text-sm' style='background: rgba(255,255,255,0.06);'>
                <span className='text-white/40'>Scale</span>
                <span className='font-semibold text-white'>{(s.currentWeight ?? 0).toFixed(1)}g</span>
                {s.brewTarget && (
                  <span className='text-white/40'>/ {s.targetWeight?.toFixed(0)}g</span>
                )}
              </div>
            )}

            {/* Main action button */}
            {showMainButton && (
              <div className='flex flex-col items-center gap-3'>
                <button
                  onClick={handleMainButton}
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg transition-all duration-200 ${mainButtonColor}`}
                  style='border: none; cursor: pointer; font-size: 0.8rem; letter-spacing: 0.05em;'
                >
                  {mainButtonLabel.toUpperCase()}
                </button>
                {mode === 1 && !active && !finished && (
                  <button
                    onClick={startFlush}
                    className='text-xs text-white/30 transition hover:text-white/60'
                    style='background: none; border: none; cursor: pointer;'
                  >
                    Flush
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Pressure gauge */}
          <div className='shrink-0'>
            <ArcGauge
              current={s.currentPressure ?? 0}
              target={s.targetPressure ?? 0}
              max={15}
              label='Pressure'
              unit=' bar'
              color='#6366f1'
              size={gaugeSize}
            />
          </div>
        </div>
      </div>

      {/* ── Sparkline footer ── */}
      <div
        className='shrink-0 px-4 pb-2'
        style='border-top: 1px solid rgba(255,255,255,0.06);'
      >
        <div className='flex items-end gap-2 pt-1'>
          <div className='flex flex-1 flex-col gap-0.5'>
            <div className='text-xs text-white/20'>Temperature</div>
            <SparklineChart dataKey='currentTemperature' color={tempColor} height={36} />
          </div>
          <div className='flex flex-1 flex-col gap-0.5'>
            <div className='text-xs text-white/20'>Pressure</div>
            <SparklineChart dataKey='currentPressure' color='#6366f1' height={36} />
          </div>
          {s.volumetricAvailable && (
            <div className='flex flex-1 flex-col gap-0.5'>
              <div className='text-xs text-white/20'>Flow</div>
              <SparklineChart dataKey='currentFlow' color='#22c55e' height={36} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
