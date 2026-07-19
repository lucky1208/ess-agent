package com.gotion.base.config.i18n;

import com.gotion.common.constants.CommonConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;
import org.springframework.web.servlet.LocaleResolver;

/***
 *                    _ooOoo_
 *                   o8888888o
 *                   88" . "88
 *                   (| -_- |)
 *                    O\ = /O
 *                ____/`---'\____
 *              .   ' \\| |// `.
 *               / \\||| : |||// \
 *             / _||||| -:- |||||- \
 *               | | \\\ - /// | |
 *             | \_| ''\---/'' | |
 *              \ .-\__ `-` ___/-. /
 *           ___`. .' /--.--\ `. . __
 *        ."" '< `.___\_<|>_/___.' >'"".
 *       | | : `- \`.;`\ _ /`;.`/ - ` : | |
 *         \ \ `-. \_ __\ /__ _/ .-` / /
 * ======`-.____`-.___\_____/___.-`____.-'======
 *                    `=---='
 *
 * .............................................
 * 佛祖保佑                               永无BUG
 * @author zhouliming
 * @package com.gotion.base.config.i18n
 * @date 2024/8/8 2:31 下午
 */
@Slf4j
@Configuration
public class MessageSourceConfig {

    @Bean
    public LocaleResolver localeResolver(){
        return new OcppLocaleResolver();
    }

    @Primary
    @Bean(name = "messageSource")
    public ReloadableResourceBundleMessageSource messageSource() {
        ReloadableResourceBundleMessageSource messageSource = new ReloadableResourceBundleMessageSource();
        messageSource.setBasename("file:" + System.getProperty("user.dir") + CommonConstants.SLASH +"i18n/message");
        messageSource.setDefaultEncoding("UTF-8");
        messageSource.setCacheMillis(10000);
        return messageSource;
    }

}
