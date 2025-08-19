interface CurrencyInputProps {
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  className?: string
}

export default function CurrencyInput({ value, onChange, placeholder = "0.00", className = "" }: CurrencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === '' || val === null) {
      onChange(undefined)
    } else {
      const parsed = parseFloat(val)
      onChange(isNaN(parsed) ? undefined : parsed)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
        $
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}