import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter
} from 'recharts';
import { ChartData } from '../services/gemini';

const COLORS = ['#233A2E', '#B89E58', '#4A5D23', '#7A3E3E', '#5B6B8A', '#8B5E3C'];

export default function QuestionFigure({ chartData }: { chartData: ChartData }) {
  if (!chartData) return null;

  const renderChart = () => {
    switch (chartData.type) {
      case 'table':
        if (!chartData.tableData) return null;
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-old-border text-sm">
              <thead>
                <tr className="bg-cream-bg">
                  {chartData.tableData.headers.map((h, i) => (
                    <th key={i} className="border border-old-border px-4 py-2 text-left font-semibold text-old-ink">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.tableData.rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-cream-bg/30'}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-old-border px-4 py-2 text-old-ink/80">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'pie':
        if (!chartData.series || !chartData.series[0]) return null;
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData.series[0].data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.series[0].data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        if (!chartData.series || !chartData.series[0]) return null;
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="x" name={chartData.xAxisLabel || 'X'} type="number" />
              <YAxis dataKey="y" name={chartData.yAxisLabel || 'Y'} type="number" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              {chartData.series.map((s, i) => (
                <Scatter key={i} name={s.name} data={s.data} fill={COLORS[i % COLORS.length]} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'bar':
      case 'histogram':
        if (!chartData.series) return null;
        
        // Merge series data for BarChart
        const barDataMap = new Map<string, any>();
        chartData.series.forEach(s => {
          s.data.forEach(d => {
            if (!barDataMap.has(d.label)) {
              barDataMap.set(d.label, { label: d.label });
            }
            barDataMap.get(d.label)[s.name] = d.value;
          });
        });
        const barData = Array.from(barDataMap.values());

        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="label" stroke="#8e8e8e" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#8e8e8e" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f5f5f0' }} contentStyle={{ borderRadius: '4px', border: '1px solid #e5e5e5' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              {chartData.series.map((s, i) => (
                <Bar key={i} dataKey={s.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        if (!chartData.series) return null;
        
        // Merge series data for LineChart
        const lineDataMap = new Map<string, any>();
        chartData.series.forEach(s => {
          s.data.forEach(d => {
            if (!lineDataMap.has(d.label)) {
              lineDataMap.set(d.label, { label: d.label });
            }
            lineDataMap.get(d.label)[s.name] = d.value;
          });
        });
        const lineData = Array.from(lineDataMap.values());

        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="label" stroke="#8e8e8e" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#8e8e8e" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #e5e5e5' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              {chartData.series.map((s, i) => (
                <Line key={i} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <div className="border border-old-border rounded-sm bg-white overflow-hidden my-4">
      <div className="bg-cream-bg border-b border-old-border px-4 py-2 text-center">
        <h4 className="font-serif font-semibold text-old-ink">{chartData.title}</h4>
        {(chartData.xAxisLabel || chartData.yAxisLabel) && (
          <p className="text-xs text-old-ink/60 mt-0.5">
            {chartData.yAxisLabel} {chartData.xAxisLabel && `vs ${chartData.xAxisLabel}`}
          </p>
        )}
      </div>
      <div className="p-4">
        {renderChart()}
      </div>
    </div>
  );
}
