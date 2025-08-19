from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice Verification</title>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50">
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect } = React;
        
        function App() {
            const [result, setResult] = useState(null);
            const [isSubmitting, setIsSubmitting] = useState(false);
            
            const testValidation = async (testName, payload) => {
                setIsSubmitting(true);
                try {
                    const response = await fetch('/api/validate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json();
                    setResult({ testName, ...data });
                } catch (error) {
                    setResult({ testName, error: 'Failed to validate' });
                } finally {
                    setIsSubmitting(false);
                }
            };
            
            return React.createElement('div', { className: 'container mx-auto py-8' },
                React.createElement('h1', { className: 'text-3xl font-bold text-center mb-8' }, 'Invoice Verification System'),
                React.createElement('div', { className: 'max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md' },
                    React.createElement('div', { className: 'text-center mb-6' },
                        React.createElement('p', { className: 'text-gray-600 mb-4' }, 'Test the invoice validation system:')
                    ),
                    React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-6' },
                        React.createElement('button', {
                            onClick: () => testValidation('ALLOW Test', {
                                scope_of_work: 'Water heater replacement',
                                service_line_id: 14,
                                service_type_id: 2,
                                labor_hours: 2.5,
                                materials: [{ name: 'Anode Rod', quantity: 1, unit: 'pcs', unit_price: 1200 }],
                                equipment: [{ name: 'Pipe Wrench', quantity: 1, unit: 'day', unit_price: 400 }]
                            }),
                            disabled: isSubmitting,
                            className: 'px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50'
                        }, 'Test A: ALLOW (Anode Rod@1200 + Pipe Wrench@400)'),
                        React.createElement('button', {
                            onClick: () => testValidation('PRICE_HIGH Test', {
                                scope_of_work: 'Water heater replacement',
                                service_line_id: 14,
                                service_type_id: 2,
                                labor_hours: 2.5,
                                materials: [{ name: 'Anode Rod', quantity: 1, unit: 'pcs', unit_price: 20000 }],
                                equipment: []
                            }),
                            disabled: isSubmitting,
                            className: 'px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50'
                        }, 'Test B: PRICE_HIGH (Anode Rod@20000)'),
                        React.createElement('button', {
                            onClick: () => testValidation('MUTEX Test', {
                                scope_of_work: 'Equipment conflict',
                                service_line_id: 14,
                                service_type_id: 2,
                                labor_hours: 0,
                                materials: [],
                                equipment: [
                                    { name: 'Pipe Wrench', quantity: 1, unit: 'day', unit_price: 400 },
                                    { name: 'Drain Snake', quantity: 1, unit: 'day', unit_price: 800 }
                                ]
                            }),
                            disabled: isSubmitting,
                            className: 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50'
                        }, 'Test C: MUTEX (Pipe Wrench + Drain Snake)')
                    ),
                    
                    result && React.createElement('div', { className: 'mt-8 p-4 border rounded-lg' },
                        React.createElement('h3', { className: 'text-xl font-semibold mb-4' }, 
                            result.testName, ' - Status: ', 
                            React.createElement('span', { 
                                className: result.invoice_status === 'ALLOW' ? 'text-green-600' : 
                                          result.invoice_status === 'NEEDS_REVIEW' ? 'text-yellow-600' : 'text-red-600'
                            }, result.invoice_status)
                        ),
                        React.createElement('p', { className: 'text-sm text-gray-600 mb-2' }, 'Mode: ', result.mode),
                        result.summary && React.createElement('div', { className: 'mb-4' },
                            React.createElement('p', { className: 'text-sm' }, 
                                'Summary - Allow: ', result.summary.allow, 
                                ', Review: ', result.summary.needs_review,
                                ', Reject: ', result.summary.reject
                            )
                        ),
                        React.createElement('details', { className: 'mt-4' },
                            React.createElement('summary', { className: 'cursor-pointer text-blue-600' }, 'View Raw Response'),
                            React.createElement('pre', { className: 'bg-gray-100 p-4 rounded text-sm overflow-auto mt-2' }, 
                                JSON.stringify(result, null, 2)
                            )
                        )
                    )
                )
            );
        }
        
        ReactDOM.render(React.createElement(App), document.getElementById('root'));
    </script>
</body>
</html>
        """
        
        self.send_response(200)
        self.send_header("Content-type","text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(html_content.encode('utf-8'))