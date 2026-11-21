import { useId } from 'react';
import { ChevronDown, LayoutDashboard } from 'lucide-react';
import './preparation-navigation.css';

interface Props {
  active: boolean;
  expanded: boolean;
  step: number;
  hasSnapshot: boolean;
  onToggle: () => void;
  onStep: (step: number) => void;
}

const steps = ['Origen', 'Procesos', 'Generar'] as const;

export function PreparationNavigation({ active, expanded, step, hasSnapshot, onToggle, onStep }: Props) {
  const id = useId();
  const open = active && expanded;
  return <div className="preparation-navigation">
    <button type="button" className={'nav-item preparation-toggle' + (active ? ' active' : '')}
      aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <LayoutDashboard size={19} aria-hidden="true" />
      <span>Configurar Plan B</span>
      <ChevronDown size={15} aria-hidden="true" className={open ? 'expanded' : ''} />
    </button>
    <div id={id} hidden={!open} inert={!open}>
      <nav className="work-subnav preparation-subnav" aria-label="Secciones de preparación">
        {steps.map((label, index) => <button key={label} type="button"
          className={'nav-item' + (active && step === index ? ' active' : '')}
          aria-current={active && step === index ? 'step' : undefined}
          disabled={index > 0 && !hasSnapshot} onClick={() => onStep(index)}>
          <span className="step-number" aria-hidden="true">{index + 1}</span>{label}
        </button>)}
      </nav>
    </div>
  </div>;
}
