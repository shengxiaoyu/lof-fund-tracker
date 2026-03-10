#!/usr/bin/env python3
"""
AkShare简单数据获取脚本
供Node.js服务器调用
"""

import akshare as ak
import json
import sys
from datetime import datetime

def get_fund_price(fund_code):
    """获取基金价格数据"""
    try:
        # 确定交易所代码
        if fund_code.startswith(('15', '16')):
            exchange_code = f"sz{fund_code}"
        elif fund_code.startswith(('50', '51')):
            exchange_code = f"sh{fund_code}"
        else:
            exchange_code = f"sz{fund_code}"
        
        print(f"获取基金数据: {fund_code} -> {exchange_code}", file=sys.stderr)
        
        # 获取ETF历史数据
        hist_data = ak.fund_etf_hist_sina(symbol=exchange_code)
        
        if not hist_data.empty:
            latest = hist_data.iloc[-1]
            price = latest.get('close', 0)
            date = latest.get('date', '')
            
            result = {
                "success": True,
                "data": {
                    "code": fund_code,
                    "price": float(price),
                    "date": str(date),
                    "source": "akshare_etf_hist",
                    "timestamp": datetime.now().isoformat()
                }
            }
            return result
        else:
            return {
                "success": False,
                "error": "历史数据为空",
                "data": None
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "data": None
        }

if __name__ == "__main__":
    # 从命令行参数获取基金代码
    if len(sys.argv) > 1:
        fund_code = sys.argv[1]
        result = get_fund_price(fund_code)
        print(json.dumps(result, ensure_ascii=False))
    else:
        # 测试模式
        result = get_fund_price("162411")
        print(json.dumps(result, ensure_ascii=False))