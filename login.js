const axios = require('axios');
const { chromium } = require('playwright');

// --- 修改点 1：读取 PushPlus Token ---
const pushPlusToken = process.env.PUSHPLUS_TOKEN; // 替换原来的 Telegram 变量
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

// --- 修改点 2：替换为 sendPushPlus 函数 ---
async function sendPushPlus(message) {
  if (!pushPlusToken) {
    console.log('⚠️ 未配置 PUSHPLUS_TOKEN，跳过推送');
    return;
  }

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const title = '🎉 Netlib 登录通知';
  // PushPlus 的 content 字段支持 \n 换行
  const content = `登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post('http://www.pushplus.plus/send', {
      token: pushPlusToken,
      title: title,
      content: content,
      template: 'txt' // 使用纯文本格式
    }, { timeout: 10000 });
    console.log('✅ PushPlus 通知发送成功');
  } catch (e) {
    console.log('⚠️ PushPlus 发送失败');
    // 打印更详细的错误
    if (e.response && e.response.data) {
      console.log(`❌ 错误详情: ${JSON.stringify(e.response.data)}`);
    } else {
      console.log(`❌ 错误: ${e.message}`);
    }
  }
}

// --- 核心登录逻辑 (完全保持不变) ---
async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
    
    console.log(`📱 ${user} - 正在访问网站...`);
    await page.goto('https://www.netlib.re/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    console.log(`🔑 ${user} - 点击登录按钮...`);
    await page.click('text=Login', { timeout: 5000 });
    
    await page.waitForTimeout(2000);
    
    console.log(`📝 ${user} - 填写用户名...`);
    await page.fill('input[name="username"], input[type="text"]', user);
    await page.waitForTimeout(1000);
    
    console.log(`🔒 ${user} - 填写密码...`);
    await page.fill('input[name="password"], input[type="password"]', pass);
    await page.waitForTimeout(1000);
    
    console.log(`📤 ${user} - 提交登录...`);
    await page.click('button:has-text("Validate"), input[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6200);
    // 检查登录是否成功
    const pageContent = await page.content();
    
    if (pageContent.includes('exclusive owner') || pageContent.includes(user)) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} - 登录失败`);
      result.message = `❌ ${user} 登录失败`;
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

// --- main 函数 (仅修改最后一行) ---
async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，等待一下再处理下一个
    if (i < accountList.length - 1) {
      console.log('⏳ 等待3秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  // --- 修改点 3：调用新的推送函数 ---
  await sendPushPlus(summaryMessage);
  
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(console.error);
