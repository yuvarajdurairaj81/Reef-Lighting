import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelSlider } from '../src/components/ChannelSlider';

const setup = (value = 50) => {
  const onChange = jest.fn();
  render(<ChannelSlider channelKey="BLUE" label="Blue" color="#3b82f6" value={value} watts={10} maxWatts={20} onChange={onChange} />);
  return { onChange, slider: screen.getByRole('slider'), box: screen.getByLabelText('Blue percentage') };
};

describe('ChannelSlider', () => {
  it('renders a 0–100 slider in 1% steps with the numeric value', () => {
    const { slider, box } = setup(95);
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '1');
    expect(box).toHaveValue(95);
    expect(screen.getByText('10.0 W / 20 W max')).toBeInTheDocument();
  });

  it('emits slider changes', () => {
    const { slider, onChange } = setup();
    fireEvent.change(slider, { target: { value: '73' } });
    expect(onChange).toHaveBeenCalledWith(73);
  });

  it('accepts manual entry and clamps out-of-range values on Enter', async () => {
    const { box, onChange } = setup();
    await userEvent.clear(box);
    await userEvent.type(box, '250{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(box).toHaveValue(100);
  });

  it('commits on blur', async () => {
    const { box, onChange } = setup();
    await userEvent.clear(box);
    await userEvent.type(box, '12');
    fireEvent.blur(box);
    expect(onChange).toHaveBeenLastCalledWith(12);
  });
});
