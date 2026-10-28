import {
  Children,
  Fragment,
  isValidElement,
  useRef,
  type ReactNode,
  type ReactElement,
  type SelectHTMLAttributes,
} from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CaretDown, CaretUp, Check } from '@phosphor-icons/react';

const EMPTY_VALUE = '__tgactor_empty_option__';
type OptionProps = {
  value?: string | number;
  disabled?: boolean;
  label?: string;
  children?: ReactNode;
};
type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'multiple' | 'size'
>;

function optionValue(option: ReactElement<OptionProps>): string {
  return String(
    option.props.value ?? Children.toArray(option.props.children).join(''),
  );
}

function firstOption(children: ReactNode): string | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<OptionProps>(child)) continue;
    if (child.type === 'option') return optionValue(child);
    const nested = firstOption(child.props.children);
    if (nested !== undefined) return nested;
  }
}

function selectedText(children: ReactNode, value: string): ReactNode {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<OptionProps>(child)) continue;
    if (child.type === 'option' && optionValue(child) === value)
      return child.props.label ?? child.props.children;
    const nested = selectedText(child.props.children, value);
    if (nested !== undefined) return nested;
  }
}

function renderOptions(children: ReactNode, groupDisabled = false): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return null;
    if (child.type === Fragment)
      return renderOptions(child.props.children, groupDisabled);
    if (child.type === 'optgroup') {
      return (
        <SelectPrimitive.Group>
          <SelectPrimitive.Label className="select-group-label">
            {child.props.label}
          </SelectPrimitive.Label>
          {renderOptions(
            child.props.children,
            groupDisabled || child.props.disabled,
          )}
        </SelectPrimitive.Group>
      );
    }
    if (child.type !== 'option') return null;
    return (
      <SelectPrimitive.Item
        className="select-option"
        value={optionValue(child) || EMPTY_VALUE}
        disabled={groupDisabled || child.props.disabled}
      >
        <SelectPrimitive.ItemText>
          {child.props.children}
        </SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="select-indicator">
          <Check size={15} />
        </SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );
  });
}

export default function Select({
  children,
  value,
  defaultValue,
  onChange,
  className = '',
  style,
  id,
  title,
  disabled,
  ...nativeProps
}: SelectProps) {
  const nativeSelect = useRef<HTMLSelectElement>(null);
  const selectedValue = String(
    value ?? defaultValue ?? firstOption(children) ?? '',
  );

  // Dispatch through a real select so existing form handlers keep their event contract.
  const selectValue = (next: string) => {
    const element = nativeSelect.current;
    if (!element) return;
    element.value = next === EMPTY_VALUE ? '' : next;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  return (
    <SelectPrimitive.Root
      value={selectedValue || EMPTY_VALUE}
      onValueChange={selectValue}
      disabled={disabled}
    >
      <select
        {...nativeProps}
        ref={nativeSelect}
        value={selectedValue}
        onChange={onChange}
        disabled={disabled}
        hidden
        aria-hidden="true"
        tabIndex={-1}
      >
        {children}
      </select>
      <SelectPrimitive.Trigger
        id={id}
        title={title}
        className={`select-trigger ${className}`}
        style={style}
        aria-label={nativeProps['aria-label']}
        aria-labelledby={nativeProps['aria-labelledby']}
        aria-describedby={nativeProps['aria-describedby']}
        aria-invalid={nativeProps['aria-invalid']}
      >
        <span className="select-value">
          <SelectPrimitive.Value>
            {selectedText(children, selectedValue) ?? ''}
          </SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon className="select-chevron">
          <CaretDown size={13} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <CaretUp size={13} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {renderOptions(children)}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <CaretDown size={13} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
