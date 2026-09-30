import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { CITIES, ROUTES } from '../game/data';
import type { GameState } from '../game/types';
import './map.css';

interface MapBoardProps {
  state: GameState | null;
  selectedRoute: string | null;
  onSelectRoute: (id: string) => void;
  legalRouteIds: Set<string>;
  highlightCityIds?: Set<string>;
  reducedMotion: boolean;
  flat: boolean;
  interactive: boolean;
}

type Route = (typeof ROUTES)[number];
type Point = { x: number; y: number };
type Camera = { x: number; y: number; zoom: number };
type RoutePiece = Point & { angle: number; width: number };

const PALETTE: Record<string, { fill: string; edge: string; ink: string; name: string }> = {
  red: { fill: '#ba665a', edge: '#87463f', ink: '#f2d8bf', name: 'red' },
  blue: { fill: '#658b9c', edge: '#436677', ink: '#d8e8e8', name: 'blue' },
  green: { fill: '#819975', edge: '#566e50', ink: '#e3ead1', name: 'green' },
  yellow: { fill: '#d3b26c', edge: '#9b7e42', ink: '#735d31', name: 'yellow' },
  orange: { fill: '#c28d62', edge: '#925f3c', ink: '#f4dfbf', name: 'orange' },
  purple: { fill: '#a188a4', edge: '#735d7c', ink: '#eee0ec', name: 'purple' },
  black: { fill: '#65706f', edge: '#424d4b', ink: '#dae1d8', name: 'black' },
  white: { fill: '#e5dfca', edge: '#aaa28e', ink: '#8a816e', name: 'white' },
  gray: { fill: '#a6ad9c', edge: '#768273', ink: '#e9eadb', name: 'any color' },
};

const CITY_MAP = new Map(CITIES.map(city => [city.id, city]));
const NORTH_AMERICA = 'M 52,24 L 480,24 C 570,24 627,36 690,30 L 940,24 Q 971,43 979,93 L 970,154 Q 973,184 954,204 L 952,239 Q 943,259 924,272 L 917,312 Q 908,334 887,349 L 873,390 Q 865,417 850,432 L 859,474 Q 879,493 888,519 L 917,546 Q 936,571 944,596 Q 939,614 926,613 L 906,592 L 892,565 Q 875,551 856,558 L 810,566 Q 778,572 752,584 L 719,580 Q 693,567 670,574 L 638,589 Q 610,598 584,586 L 555,588 Q 528,603 499,590 L 450,591 Q 414,603 385,589 L 350,601 L 321,588 L 289,578 L 263,561 L 240,558 L 219,543 L 199,533 Q 179,520 170,503 L 144,480 L 126,467 Q 111,449 111,426 L 96,409 L 82,383 L 65,376 Q 53,355 53,329 L 45,295 L 52,274 L 45,250 L 53,226 L 47,209 L 58,178 L 61,151 L 68,121 L 63,99 L 70,78 L 59,59 Z';

function routeGeometry(route: Route) {
  const from = CITY_MAP.get(route.from)!;
  const to = CITY_MAP.get(route.to)!;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const normal = { x: -dy / distance, y: dx / distance };
  const siblings = route.parallelGroup ? ROUTES.filter(other => other.parallelGroup === route.parallelGroup) : [route];
  const offset = (siblings.findIndex(other => other.id === route.id) - (siblings.length - 1) / 2) * 17;
  const inset = Math.min(21, distance * 0.17);
  const start = { x: from.x + dx / distance * inset + normal.x * offset, y: from.y + dy / distance * inset + normal.y * offset };
  const end = { x: to.x - dx / distance * inset + normal.x * offset, y: to.y - dy / distance * inset + normal.y * offset };
  const bend = siblings.length > 1 ? offset * 0.3 : ((route.id.length % 3) - 1) * 3;
  const middle = { x: (start.x + end.x) / 2 + normal.x * bend, y: (start.y + end.y) / 2 + normal.y * bend };
  const usable = Math.hypot(end.x - start.x, end.y - start.y);
  const pieceWidth = Math.min(32, usable / route.length * 0.76);
  const pieces: RoutePiece[] = Array.from({ length: route.length }, (_, index) => {
    const t = (index + 0.5) / route.length;
    const inv = 1 - t;
    const tangentX = 2 * inv * (middle.x - start.x) + 2 * t * (end.x - middle.x);
    const tangentY = 2 * inv * (middle.y - start.y) + 2 * t * (end.y - middle.y);
    return {
      x: inv * inv * start.x + 2 * inv * t * middle.x + t * t * end.x,
      y: inv * inv * start.y + 2 * inv * t * middle.y + t * t * end.y,
      angle: Math.atan2(tangentY, tangentX) * 180 / Math.PI,
      width: pieceWidth,
    };
  });
  return { pieces, d: `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}` };
}

const GEOMETRY = new Map(ROUTES.map(route => [route.id, routeGeometry(route)]));

function ColorMark({ color, ink }: { color: string; ink: string }) {
  switch (color) {
    case 'red': return <circle r="2.1" fill={ink} />;
    case 'blue': return <path d="M-3 0H3" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />;
    case 'green': return <path d="M-2.5-2.5L2.5 2.5M2.5-2.5L-2.5 2.5" stroke={ink} strokeWidth="1.1" />;
    case 'yellow': return <path d="M0-3V3M-3 0H3" stroke={ink} strokeWidth="1.2" />;
    case 'orange': return <path d="M-2-2.5L2 2.5" stroke={ink} strokeWidth="1.8" />;
    case 'purple': return <rect x="-2" y="-2" width="4" height="4" rx="0.5" fill={ink} />;
    case 'white': return <path d="M-3-1.5H3M-3 1.5H3" stroke={ink} strokeWidth="1" />;
    case 'black': return <path d="M-2-2.5V2.5M2-2.5V2.5" stroke={ink} strokeWidth="1" />;
    default: return <path d="M0-3L3 0L0 3L-3 0Z" fill="none" stroke={ink} strokeWidth="1" />;
  }
}

function Terrain({ prefix }: { prefix: string }) {
  const mountains = useMemo(() => Array.from({ length: 26 }, (_, index) => ({
    x: 202 + Math.sin(index * 1.83) * 27 + index * 2.8,
    y: 91 + index * 14.2,
    size: 10 + (index % 4) * 3,
  })), []);
  return <g className="ia-terrain" aria-hidden="true">
    <rect x="-1000" y="-1000" width="3000" height="2650" fill={`url(#${prefix}-sea)`} />
    <path d={NORTH_AMERICA} transform="translate(0 6)" fill="#728c7b" opacity=".35" className="ia-land-depth" />
    <path d={NORTH_AMERICA} fill={`url(#${prefix}-land)`} stroke="#a8b29a" strokeWidth="1.5" />
    <path d={NORTH_AMERICA} fill={`url(#${prefix}-paper)`} opacity=".38" />
    <path d="M109 57Q156 165 166 277T257 504Q288 526 290 559L360 580Q323 515 330 449T302 300Q295 166 264 64Z" fill="#d5d7bd" opacity=".46" />
    <path d="M166 77Q202 185 220 283T272 457M155 116Q186 235 208 296T255 471M272 80Q310 185 307 278T347 445M288 94Q321 211 320 292T360 439" fill="none" stroke="#9ba88c" strokeWidth=".8" opacity=".34" />
    <path d="M299 344Q360 327 400 357T503 379Q568 391 617 363T727 341Q787 348 831 403L832 454Q772 411 733 422T624 453Q558 457 507 436T402 415Q359 399 308 422Z" fill="#d5d8bb" opacity=".22" />
    <path d="M609 226C617 253 606 285 623 321S641 350 631 382S649 423 630 451S623 498 645 536" fill="none" stroke="#8baeb0" strokeWidth="3" opacity=".65" />
    <path d="M568 321Q596 321 623 338M626 411Q587 413 563 430M631 464Q675 466 701 485" fill="none" stroke="#8baeb0" strokeWidth="1.7" opacity=".6" />
    <path d="M661 113Q683 97 707 111L731 121L717 138L680 136L659 126Z M710 145Q727 143 734 160L730 200L722 226L712 224L706 188Z M741 161Q757 140 778 158L786 180L770 190L750 181Z M772 206Q802 193 816 212L806 226L779 222Z M816 187Q842 174 859 181L851 196L824 202Z" fill="#a6c1bc" stroke="#8caaa6" strokeWidth="1.2" />
    <path d="M522 77Q547 58 557 78L550 103L537 121L527 116Z M572 105Q587 91 601 106L597 123L578 126Z" fill="#a6c1bc" stroke="#8caaa6" strokeWidth="1" />
    <path d="M321 255Q337 250 344 262L337 275L323 270Z" fill="#a6c1bc" opacity=".8" />
    <g stroke="#7f9278" fill="none" strokeWidth=".9" opacity=".46">
      {mountains.map((m, i) => <g key={i} transform={`translate(${m.x} ${m.y})`}>
        <path d={`M ${-m.size} ${m.size * .57} L 0 ${-m.size * .73} L ${m.size * .85} ${m.size * .57} M 0 ${-m.size * .73} L ${-m.size * .17} 1 L ${m.size * .18} ${-m.size * .13} L ${m.size * .85} ${m.size * .57}`} />
        <path d={`M ${m.size * .13} 4 l 4 6 M ${m.size * .34} 7 l 3 4`} />
      </g>)}
    </g>
    <g stroke="#7f9278" strokeWidth=".8" fill="none" opacity=".33">
      {Array.from({ length: 18 }, (_, index) => {
        const x = 765 + Math.sin(index * 1.93) * 16 + index * 2;
        const y = 303 + index * 8;
        return <path key={index} d={`M${x - 8} ${y + 5}L${x} ${y - 5}L${x + 8} ${y + 5}M${x} ${y - 5}L${x - 1} ${y + 2}`} />;
      })}
    </g>
    <g className="ia-region-labels" fill="#687d71" opacity=".51">
      <text x="196" y="288" transform="rotate(71 196 288)">THE WESTERN RANGE</text>
      <text x="433" y="262" transform="rotate(-7 433 262)">GREAT PLAINS</text>
      <text x="612" y="158" transform="rotate(-10 612 158)">GREAT LAKES</text>
      <text x="80" y="527" transform="rotate(-24 80 527)">PACIFIC OCEAN</text>
      <text x="971" y="415" transform="rotate(77 971 415)">ATLANTIC OCEAN</text>
      <text x="722" y="620">GULF OF MEXICO</text>
    </g>
    <g transform="translate(83 580)" className="ia-compass" stroke="#587669" fill="none" opacity=".64">
      <circle r="24" strokeWidth=".6" />
      <circle r="19" strokeWidth=".5" strokeDasharray="1 4" />
      <path d="M0-36L5-5L0 0L-5-5ZM0 36L5 5L0 0L-5 5ZM-30 0L-4-4L0 0L-4 4ZM30 0L4-4L0 0L4 4Z" fill="#587669" strokeWidth=".6" />
      <text x="0" y="-43" fill="#466355" stroke="none" textAnchor="middle">N</text>
      <text x="0" y="47" fill="#466355" stroke="none" textAnchor="middle">S</text>
      <text x="-37" y="3" fill="#466355" stroke="none" textAnchor="middle">W</text>
      <text x="38" y="3" fill="#466355" stroke="none" textAnchor="middle">E</text>
    </g>
    <g transform="translate(409 622)" stroke="#637a6a" fill="#637a6a" opacity=".6">
      <path d="M0 0H125M0-3V3M62.5-3V3M125-3V3" fill="none" strokeWidth="1" />
      <text x="62.5" y="14" stroke="none" textAnchor="middle" className="ia-scale-label">A JOURNEY IN EVERY LINE</text>
    </g>
  </g>;
}

function RouteSegment({ piece, color, ownerColor, index, flat }: { piece: RoutePiece; color: string; ownerColor?: string; index: number; flat: boolean }) {
  const paint = PALETTE[color] ?? PALETTE.gray;
  const w = piece.width;
  if (ownerColor) return <g transform={`translate(${piece.x} ${piece.y}) rotate(${piece.angle})`} className="ia-train-piece" style={{ '--ia-piece-delay': `${index * 35}ms` } as React.CSSProperties}>
    {!flat && <rect className="ia-piece-shadow" x={-w / 2 + 2} y="-3" width={w + 1} height="13" rx="3" fill="#344b42" opacity=".29" />}
    <path d={`M${-w / 2} -3H${w / 2}V5Q${w / 2} 7 ${w / 2 - 2} 7H${-w / 2 + 2}Q${-w / 2} 7 ${-w / 2} 5Z`} fill={ownerColor} />
    <rect x={-w / 2} y="-7" width={w} height="10" rx="2.5" fill={ownerColor} stroke="#263f38" strokeWidth=".7" />
    <rect x={-w / 2 + 2} y="-6" width={Math.max(w - 4, 1)} height="2" rx="1" fill="#fff7d6" opacity=".47" />
    <path d={`M${-w / 2 + 3} 5H${w / 2 - 3}`} stroke="#172e29" opacity=".45" strokeWidth="2.3" />
    <rect x={-w / 2 + 4} y="-2.5" width={Math.max(w - 8, 3)} height="3" rx=".8" fill="#fff5d6" opacity=".8" />
    <path d={`M${-w / 2 + 4} -2.5V.5M0-2.5V.5M${w / 2 - 4}-2.5V.5`} stroke={ownerColor} strokeWidth="1.7" />
    <path d={`M${-w / 2 - 2} 1H${-w / 2}M${w / 2} 1H${w / 2 + 2}`} stroke="#3b5148" strokeWidth="2" />
  </g>;
  return <g transform={`translate(${piece.x} ${piece.y}) rotate(${piece.angle})`} className="ia-empty-piece">
    <path d={`M${-w / 2 + 3} -8V8M${-w / 2 + 10}-8V8M${w / 2 - 10}-8V8M${w / 2 - 3}-8V8`} stroke="#70694f" strokeWidth="2.8" opacity=".45" />
    {!flat && <rect x={-w / 2 + 1.3} y="-3.5" width={w} height="11" rx="2" fill={paint.edge} opacity=".3" />}
    <rect x={-w / 2} y="-6" width={w} height="12" rx="2.2" fill={paint.fill} stroke={paint.edge} strokeWidth=".85" />
    <path d={`M${-w / 2 + 2} -4.1H${w / 2 - 2}`} stroke="#fff4d7" strokeWidth="1.3" opacity=".46" />
    <path d={`M${-w / 2 + 2} 4.2H${w / 2 - 2}`} stroke={paint.edge} strokeWidth=".75" opacity=".5" />
    <ColorMark color={color} ink={paint.ink} />
  </g>;
}

export default function MapBoard({ state, selectedRoute, onSelectRoute, legalRouteIds, highlightCityIds = new Set<string>(), reducedMotion, flat, interactive }: MapBoardProps) {
  const prefix = `ia-${useId().replace(/:/g, '')}`;
  const stageRef = useRef<HTMLDivElement>(null);
  const routeRefs = useRef(new Map<string, SVGGElement>());
  const pointers = useRef(new Map<number, Point>());
  const pressedRoute = useRef<string | null>(null);
  const dragged = useRef(false);
  const dragDistance = useRef(0);
  const initialized = useRef(false);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const [camera, setCamera] = useState<Camera>({ x: 500, y: 325, zoom: 1 });
  const cameraRef = useRef(camera);
  const [dragging, setDragging] = useState(false);
  const [hoverRoute, setHoverRoute] = useState<string | null>(null);
  const baseWidth = 650 * size.width / size.height;
  const minZoom = Math.min(1, baseWidth / 1000);
  const highlightKey = [...highlightCityIds].sort().join('|');

  const updateCamera = useCallback((next: Camera) => {
    const zoom = Math.max(minZoom, Math.min(3.2, next.zoom));
    const halfWidth = baseWidth / zoom / 2;
    const halfHeight = 650 / zoom / 2;
    const x = halfWidth >= 500 ? 500 : Math.max(halfWidth - 25, Math.min(1025 - halfWidth, next.x));
    const y = halfHeight >= 325 ? 325 : Math.max(halfHeight - 25, Math.min(675 - halfHeight, next.y));
    const view = { x, y, zoom };
    cameraRef.current = view;
    setCamera(view);
  }, [baseWidth, minZoom]);

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width && height) setSize({ width, height });
      if (!initialized.current && width > 0) {
        initialized.current = true;
        const first = { x: 500, y: 325, zoom: width < 680 ? .9 : 1 };
        cameraRef.current = first;
        setCamera(first);
      }
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { updateCamera(cameraRef.current); }, [updateCamera]);

  useEffect(() => {
    if (!highlightKey) return;
    const ids = new Set(highlightKey.split('|'));
    const points = CITIES.filter(city => ids.has(city.id));
    if (!points.length) return;
    const left = Math.min(...points.map(city => city.x));
    const right = Math.max(...points.map(city => city.x));
    const top = Math.min(...points.map(city => city.y));
    const bottom = Math.max(...points.map(city => city.y));
    updateCamera({
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      zoom: Math.min(1.8, baseWidth / (right - left + 140), 650 / (bottom - top + 140)),
    });
  }, [highlightKey, baseWidth, updateCamera]);

  const zoomAt = useCallback((factor: number, anchor?: Point) => {
    const previous = cameraRef.current;
    const nextZoom = Math.max(minZoom, Math.min(3.2, previous.zoom * factor));
    if (!anchor) { updateCamera({ ...previous, zoom: nextZoom }); return; }
    const nx = anchor.x / size.width - .5;
    const ny = anchor.y / size.height - .5;
    updateCamera({
      x: previous.x + nx * baseWidth * (1 / previous.zoom - 1 / nextZoom),
      y: previous.y + ny * 650 * (1 / previous.zoom - 1 / nextZoom),
      zoom: nextZoom,
    });
  }, [baseWidth, minZoom, size, updateCamera]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragged.current = false;
      dragDistance.current = 0;
      const target = event.target as Element;
      pressedRoute.current = target.closest('[data-route-id]')?.getAttribute('data-route-id') ?? null;
    } else {
      dragged.current = true;
      pressedRoute.current = null;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previousPoint = pointers.current.get(event.pointerId);
    if (!previousPoint) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()];
    const previous = cameraRef.current;
    const dx = event.clientX - previousPoint.x;
    const dy = event.clientY - previousPoint.y;
    dragDistance.current += Math.hypot(dx, dy);
    if (dragDistance.current > 5) dragged.current = true;
    if (after.length === 1) {
      updateCamera({ ...previous, x: previous.x - dx * baseWidth / previous.zoom / size.width, y: previous.y - dy * 650 / previous.zoom / size.height });
    } else if (after.length === 2) {
      dragged.current = true;
      const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (oldDistance < 1 || newDistance < 1) return;
      const rect = stageRef.current!.getBoundingClientRect();
      const oldMiddle = { x: (before[0].x + before[1].x) / 2 - rect.left, y: (before[0].y + before[1].y) / 2 - rect.top };
      const newMiddle = { x: (after[0].x + after[1].x) / 2 - rect.left, y: (after[0].y + after[1].y) / 2 - rect.top };
      const nextZoom = Math.max(minZoom, Math.min(3.2, previous.zoom * newDistance / oldDistance));
      updateCamera({
        x: previous.x + (oldMiddle.x / size.width - .5) * baseWidth / previous.zoom - (newMiddle.x / size.width - .5) * baseWidth / nextZoom,
        y: previous.y + (oldMiddle.y / size.height - .5) * 650 / previous.zoom - (newMiddle.y / size.height - .5) * 650 / nextZoom,
        zoom: nextZoom,
      });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const routeToSelect = pressedRoute.current;
    if (event.type === 'pointerup' && pointers.current.size === 1 && routeToSelect && interactive && !dragged.current) {
      onSelectRoute(routeToSelect);
    }
    pressedRoute.current = null;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  };

  const keyboardRoute = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectRoute(id);
    } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = ROUTES.findIndex(route => route.id === id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? ROUTES.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + ROUTES.length) % ROUTES.length;
      const route = ROUTES[next];
      routeRefs.current.get(route.id)?.focus();
      const from = CITY_MAP.get(route.from)!;
      const to = CITY_MAP.get(route.to)!;
      updateCamera({ ...cameraRef.current, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
    }
  };

  const hovered = ROUTES.find(route => route.id === hoverRoute);
  const viewWidth = baseWidth / camera.zoom;
  const viewHeight = 650 / camera.zoom;
  const fit = () => updateCamera({ x: 500, y: 325, zoom: minZoom });

  return <div className={`ia-map-board${flat ? ' ia-map--flat' : ''}${reducedMotion ? ' ia-map--still' : ''}${interactive ? ' ia-map--interactive' : ''}`}>
    <div
      className={`ia-map-stage${dragging ? ' ia-map-stage--dragging' : ''}`}
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
    >
      <svg className="ia-map-svg" viewBox={`${camera.x - viewWidth / 2} ${camera.y - viewHeight / 2} ${viewWidth} ${viewHeight}`} role="group" aria-label="North America railway map. Select a route to inspect it. Use arrow keys to move between routes, and Enter to select.">
        <defs>
          <linearGradient id={`${prefix}-sea`} x1="0" y1="0" x2=".3" y2="1"><stop stopColor="#aec7bd" /><stop offset="1" stopColor="#88aba1" /></linearGradient>
          <linearGradient id={`${prefix}-land`} x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#f1ecd7" /><stop offset=".52" stopColor="#e9e5cc" /><stop offset="1" stopColor="#dcdcc1" /></linearGradient>
          <pattern id={`${prefix}-paper`} width="48" height="48" patternUnits="userSpaceOnUse"><path d="M7 8h1M31 35h1M42 15h1M15 29h1M25 4h1M3 43h1" stroke="#7b7e65" strokeWidth=".6" opacity=".37" /><path d="M9 20h9M31 44h5" stroke="#fff9e8" strokeWidth=".7" opacity=".7" /></pattern>
        </defs>
        <Terrain prefix={prefix} />
        <g className="ia-routes">
          {ROUTES.map(route => {
            const geometry = GEOMETRY.get(route.id)!;
            const owner = state?.claims[route.id];
            const player = owner === undefined ? undefined : state?.players[owner];
            const isSelected = selectedRoute === route.id;
            const isHover = hoverRoute === route.id;
            const isLegal = !state || legalRouteIds.has(route.id);
            const from = CITY_MAP.get(route.from)!;
            const to = CITY_MAP.get(route.to)!;
            const description = `${from.name} to ${to.name}, ${route.length} ${route.length === 1 ? 'train' : 'trains'}, ${PALETTE[route.color]?.name ?? route.color}. ${player ? `Claimed by ${player.name}.` : !interactive ? 'Unclaimed.' : isLegal ? 'Available to claim.' : 'Not available this turn.'}`;
            return <g
              key={route.id}
              ref={element => { if (element) routeRefs.current.set(route.id, element); else routeRefs.current.delete(route.id); }}
              className={`ia-route${player ? ' ia-route--claimed' : ''}${isSelected ? ' ia-route--selected' : ''}${isHover ? ' ia-route--hover' : ''}${interactive && !isLegal && !player ? ' ia-route--unavailable' : ''}`}
              data-route-id={route.id}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={description}
              aria-pressed={interactive ? isSelected : undefined}
              onClick={event => { if (interactive && event.detail === 0) onSelectRoute(route.id); }}
              onKeyDown={interactive ? event => keyboardRoute(event, route.id) : undefined}
              onMouseEnter={() => { if (interactive && !dragging) setHoverRoute(route.id); }}
              onMouseLeave={() => setHoverRoute(null)}
              onFocus={event => {
                setHoverRoute(route.id);
                if (event.currentTarget.matches(':focus-visible')) updateCamera({ ...cameraRef.current, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
              }}
              onBlur={() => setHoverRoute(null)}
            >
              <title>{description}</title>
              <path className="ia-route-aura" d={geometry.d} fill="none" stroke="#f8e7b5" strokeWidth="25" strokeLinecap="round" />
              <path className="ia-route-outline" d={geometry.d} fill="none" stroke="#98713f" strokeWidth="19" strokeLinecap="round" strokeDasharray="1 5" />
              <path className="ia-route-rail" d={geometry.d} fill="none" stroke="#756f58" strokeWidth="3.1" strokeDasharray="2 5" opacity=".3" />
              {geometry.pieces.map((piece, index) => <RouteSegment key={index} piece={piece} color={route.color} ownerColor={player?.color} index={index} flat={flat} />)}
              <path className="ia-route-hit" d={geometry.d} fill="none" stroke="transparent" strokeWidth="29" strokeLinecap="round" />
            </g>;
          })}
        </g>
        <g className="ia-cities">
          {CITIES.map(city => {
            const highlighted = highlightCityIds.has(city.id);
            const labelDx = city.labelDx ?? 11;
            const labelDy = city.labelDy ?? -11;
            return <g key={city.id} className={`ia-city${highlighted ? ' ia-city--highlighted' : ''}`}>
              {highlighted && <circle className="ia-city-halo" cx={city.x} cy={city.y} r="15" fill="none" stroke="#aa773d" strokeWidth="2.5" />}
              {!flat && <ellipse cx={city.x + 2} cy={city.y + 4} rx="7.8" ry="5.4" fill="#354a3c" opacity=".22" />}
              <circle cx={city.x} cy={city.y} r="6.5" fill="#f5ecd4" stroke="#626c53" strokeWidth="1.3" />
              <circle cx={city.x} cy={city.y} r="3.1" fill={highlighted ? '#bb8543' : '#59664f'} />
              <circle cx={city.x - 1} cy={city.y - 1.5} r="1" fill="#fffbe5" opacity=".65" />
              <text className="ia-city-label" x={city.x + labelDx} y={city.y + labelDy} textAnchor="start">{city.name}</text>
            </g>;
          })}
        </g>
      </svg>
      <div className="ia-map-corner ia-map-corner--nw" aria-hidden="true" /><div className="ia-map-corner ia-map-corner--ne" aria-hidden="true" /><div className="ia-map-corner ia-map-corner--sw" aria-hidden="true" /><div className="ia-map-corner ia-map-corner--se" aria-hidden="true" />
      <div className="ia-map-stamp" aria-hidden="true"><span>IRON ATLAS</span><small>THE NORTH AMERICAN EXPEDITION</small></div>
    </div>
    <div className="ia-map-controls" aria-label="Map view controls" onPointerDown={event => event.stopPropagation()}>
      <button type="button" aria-label="Zoom out on map" title="Zoom out" onClick={() => zoomAt(1 / 1.3)} disabled={camera.zoom <= minZoom + .01}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10H15" /></svg></button>
      <button type="button" aria-label="Zoom in on map" title="Zoom in" onClick={() => zoomAt(1.3)} disabled={camera.zoom >= 3.19}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10H15M10 5V15" /></svg></button>
      <span className="ia-controls-divider" />
      <button className="ia-map-fit" type="button" aria-label="Fit the whole map in view" title="Fit whole map" onClick={fit}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4H4V7M13 4H16V7M4 13V16H7M16 13V16H13" /></svg><span>Fit</span></button>
    </div>
    <div className="ia-map-help"><span className="ia-map-help-desktop">Drag to explore</span><span className="ia-map-help-mobile">Drag to explore · Pinch to zoom</span><span className="ia-map-zoom">{Math.round(camera.zoom / minZoom * 100)}%</span></div>
    {hovered && interactive && <div className="ia-map-tooltip" role="status"><span>{CITY_MAP.get(hovered.from)!.name} <b aria-hidden="true">—</b> {CITY_MAP.get(hovered.to)!.name}</span><small>{hovered.length} {hovered.length === 1 ? 'train' : 'trains'} · {PALETTE[hovered.color]?.name ?? hovered.color}</small></div>}
  </div>;
}
